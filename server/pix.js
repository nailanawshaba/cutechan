var async = require('async'),
    config = require('./config'),
    child_process = require('child_process'),
    db = require('./db'),
    formidable = require('formidable'),
    fs = require('fs'),
    im = require('imagemagick'),
    path = require('path'),
    util = require('util');

function get_thumb_specs(w, h, pinky) {
	var QUALITY = config[pinky ? 'PINKY_QUALITY' : 'THUMB_QUALITY'];
	var bound = config[pinky ? 'PINKY_DIMENSIONS' : 'THUMB_DIMENSIONS'];
	var r = Math.max(w / bound[0], h / bound[1], 1);
	var bg = pinky ? '#d6daf0' : '#eef2ff';
	return {dims: [Math.round(w/r), Math.round(h/r)], quality: QUALITY,
			bg_color: bg, bound: bound};
}

exports.ImageUpload = function (clients, allocate_post, status) {
	this.clients = clients;
	this.allocate_post = allocate_post;
	this.status = status;
};

var IU = exports.ImageUpload.prototype;

var validFields = ['client_id', 'alloc', 'spoiler'];

IU.handle_request = function (req, resp) {
	this.resp = resp;
	var accepts = (req.headers.accept || '').split(',');
	for (var i = 0; i < accepts.length; i++) {
		var mime = accepts[i].split(';')[0].trim();
		if (mime == 'application/json') {
			this.json_response = true;
			break;
		}
	}
	var len = parseInt(req.headers['content-length'], 10);
	if (len > 0 && len > config.IMAGE_FILESIZE_MAX + (20*1024))
		return this.failure('File is too large.');
	var form = new formidable.IncomingForm();
	form.maxFieldsSize = 2048;
	form.onPart = function (part) {
		if (part.filename && part.name == 'image')
			form.handlePart(part);
		else if (!part.filename && validFields.indexOf(part.name) >= 0)
			form.handlePart(part);
		else
			this._error('Superfluous field.');
	};
	try {
		form.parse(req, this.parse_form.bind(this));
	}
	catch (err) {
		console.error(err);
		this.failure("Invalid request.");
	}
};

IU.parse_form = function (err, fields, files) {
	if (err) {
		console.error("Upload error: " + err);
		return this.failure('Invalid upload.');
	}
	var image = files.image;
	if (!image)
		return this.failure('No image.');
	this.image = image;
	var client = this.clients[fields.client_id];
	if (!client)
		return this.failure('Invalid client id.');
	this.client = client;

	if (client.uploading) {
		this.failure('Already uploading.');
		/* previous line negated client.uploading, so restore it */
		client.uploading = true;
		return;
	}
	client.uploading = true;
	if (client.post && client.post.image)
		return this.failure('Image already exists.');
	image.ext = path.extname(image.filename).toLowerCase();
	if (image.ext == '.jpeg')
		image.ext = '.jpg';
	if (['.png', '.jpg', '.gif'].indexOf(image.ext) < 0)
		return this.failure('Invalid image format.');
	if (fields.alloc) {
		try {
			this.alloc = JSON.parse(fields.alloc);
		}
		catch (e) {
			return this.failure('Bad alloc.');
		}
	}
	else if (!client.post)
		return this.failure('Missing alloc.');
	image.imgnm = image.filename.substr(0, 256);
	var spoiler = parseInt(fields.spoiler, 10);
	if (spoiler) {
		var sps = config.SPOILER_IMAGES;
		if (sps.normal.indexOf(spoiler) < 0
				&& sps.trans.indexOf(spoiler) < 0)
			return this.failure('Bad spoiler.');
		image.spoiler = spoiler;
	}

	/* Only throttle new threads for now */
	if (client.post || (this.alloc && this.alloc.op))
		this.process(null);
	else
		client.db.check_throttle(client.ip, this.process.bind(this));
}

IU.process = function (err) {
	if (err)
		return this.failure(err);
	this.status('Verifying...');
	var image = this.image;
	var tagged_path = image.ext.replace('.', '') + ':' + image.path;
	var self = this;
	async.parallel({
		stat: fs.stat.bind(fs, image.path),
		dims: im.identify.bind(im, tagged_path)
	}, verified);

	function verified(err, rs) {
		if (err) {
			console.error(err);
			return self.failure('Bad image.');
		}
		var w = rs.dims.width, h = rs.dims.height;
		image.size = rs.stat.size;
		image.dims = [w, h];
		if (!w || !h)
			return self.failure('Invalid image dimensions.');
		if (w > config.IMAGE_WIDTH_MAX)
			return self.failure('Image is too wide.');
		if (h > config.IMAGE_HEIGHT_MAX)
			return self.failure('Image is too tall.');

		async.parallel({
			MD5: MD5_file.bind(null, image.path),
			hash: perceptual_hash.bind(null, tagged_path)
		}, hashed);
	}

	function hashed(err, rs) {
		if (err)
			return self.failure(err);
		image.MD5 = rs.MD5;
		image.hash = rs.hash;
		self.client.db.check_duplicate(image.hash, deduped);
	}

	function deduped(err, rs) {
		if (err)
			return self.failure(err);
		image.thumb_path = image.path + '_thumb';
		var pinky = (self.client.post && self.client.post.op) ||
				(self.alloc && self.alloc.op);
		var w = image.dims[0], h = image.dims[1];
		var specs = get_thumb_specs(w, h, pinky);
		/* Determine if we really need a thumbnail */
		var sp = image.spoiler;
		if (!sp && image.size < 30*1024
				&& ['.jpg', '.png'].indexOf(image.ext) >= 0
				&& w <= specs.dims[0] && h <= specs.dims[1]) {
			return got_thumbnail(false, false, null);
		}
		var info = {
			src: tagged_path,
			ext: image.ext,
			dest: image.thumb_path,
			dims: specs.dims,
			quality: specs.quality,
			bg: specs.bg_color,
		};
		if (sp && config.SPOILER_IMAGES.trans.indexOf(sp) >= 0) {
			self.status('Spoilering...');
			var comp = composite_src(sp, pinky);
			image.comp_path = image.path + '_comp';
			image.dims = [w, h].concat(specs.bound);
			info.composite = comp;
			info.compDest = image.comp_path;
			info.compDims = specs.bound;
			async.parallel([resize_image.bind(null, info, false),
				resize_image.bind(null, info, true)],
				got_thumbnail.bind(null, true, comp));
		}
		else {
			image.dims = [w, h].concat(specs.dims);
			if (!sp)
				self.status('Thumbnailing...');
			resize_image(info, false,
					got_thumbnail.bind(null, true, false));
		}
	}

	function got_thumbnail(nail, comp, err) {
		if (err)
			return self.failure(err);
		self.status('Publishing...');
		var time = new Date().getTime();
		image.src = time + image.ext;
		var dest, mvs;
		dest = media_path('src', image.src);
		mvs = [mv_file.bind(null, image.path, dest)];
		if (nail) {
			nail = time + '.jpg';
			image.thumb = nail;
			nail = media_path('thumb', nail);
			mvs.push(mv_file.bind(null, image.thumb_path, nail));
		}
		if (comp) {
			comp = time + 's' + image.spoiler + '.jpg';
			image.composite = comp;
			comp = media_path('thumb', comp);
			mvs.push(mv_file.bind(null, image.comp_path, comp));
			delete image.spoiler;
		}
		async.parallel(mvs, function (err, rs) {
			if (err) {
				console.error(err);
				return self.failure("Distro failure.");
			}
			image.path = dest;
			if (nail)
				image.thumb_path = nail;
			if (comp)
				image.comp_path = comp;
			self.publish();
		});
	}
}

function composite_src(spoiler, pinky) {
	var file = 'spoiler' + (pinky ? 's' : '') + spoiler + '.png';
	return media_path('kana', file);
}

function media_path(dir, filename) {
	return path.join(config.MEDIA_DIR, dir, filename);
}
exports.media_path = media_path;

IU.read_image_filesize = function (callback) {
	var self = this;
	fs.stat(this.image.path, function (err, stat) {
		if (err) {
			console.error(err);
			callback('Internal filesize error.');
		}
		else if (stat.size > config.IMAGE_FILESIZE_MAX)
			callback('File is too large.');
		else
			callback(null, stat.size);
	});
};

function MD5_file(path, callback) {
	child_process.exec('md5sum -b ' + path, function (err, stdout, stderr) {
		if (!err) {
			var m = stdout.match(/^([\da-f]{32})/i);
			if (m)
				return callback(null, m[1].toLowerCase());
		}
		console.log(stdout);
		console.error(stderr);
		return callback('Hashing error.');
	});
}
exports.MD5_file = MD5_file;

function mv_file(src, dest, callback) {
	var mv = child_process.spawn('/bin/mv', ['-n', src, dest]);
	mv.on('error', callback);
	mv.stderr.on('data', function (buf) {
		process.stderr.write(buf);
	});
	mv.on('exit', function (code) {
		callback(code ? 'mv error' : null);
	});
}
exports.mv_file = mv_file;

function perceptual_hash(src, callback) {
	var tmp = '/tmp/hash' + (''+Math.random()).substr(2) + '.gray';
	var args = [src + '[0]',
			'-background', 'white', '-mosaic', '+matte',
			'-scale', '16x16!',
			'-type', 'grayscale', '-depth', '8',
			tmp];
	im.convert(args, function (err, stdout, stderr) {
		if (err) {
			console.error(stderr);
			return callback('Hashing error.');
		}
		var bin = path.join(__dirname, 'perceptual');
		var hasher = child_process.spawn(bin, [tmp]);
		hasher.on('error', function (err) {
			fs.unlink(tmp);
			callback(err);
		});
		var hash = [];
		hasher.stdout.on('data', function (buf) {
			hash.push(buf.toString('ascii'));
		});
		hasher.stderr.on('data', function (buf) {
			process.stderr.write(buf);
		});
		hasher.on('exit', function (code) {
			fs.unlink(tmp);
			if (code != 0)
				return callback('Hashing error.');
			hash = hash.join('').trim();
			if (hash.length != 64)
				return callback('Hashing problem.');
			callback(null, hash);
		});
	});
}

exports.bury_image = function (src, thumb, altThumb, callback) {
	/* Just in case */
	var m = /^\d+\w*\.\w+$/;
	if (!src.match(m))
		return callback('Invalid image.');
	var mvs = [mv.bind(null, 'src', src)];
	function try_thumb(t) {
		if (!t)
			return;
		if (!t.match(m))
			return callback('Invalid thumbnail.');
		mvs.push(mv.bind(null, 'thumb', t));
	}
	try_thumb(thumb);
	try_thumb(altThumb);
	async.parallel(mvs, callback);
	function mv(p, nm, cb) {
		mv_file(media_path(p, nm),
			path.join(config.DEAD_DIR, p, nm), cb);
	}
};

function setup_im_args(o, args) {
	var args = [], dims = o.dims;
	if (o.ext == '.jpg')
		args.push('-define', 'jpeg:size=' + (dims[0] * 2) + 'x' +
				(dims[1] * 2));
	if (!o.setup) {
		o.src += '[0]';
		o.dest = 'jpg:' + o.dest;
		if (o.compDest)
			o.compDest = 'jpg:' + o.compDest;
		o.flatDims = o.dims[0] + 'x' + o.dims[1];
		if (o.compDims)
			o.compDims = o.compDims[0] + 'x' + o.compDims[1];
		o.quality += '';
		o.setup = true;
	}
	args.push(o.src, '-gamma', '0.454545', '-filter', 'box');
	return args;
}

function resize_image(o, comp, callback) {
	var args = setup_im_args(o);
	var dims = comp ? o.compDims : o.flatDims;
	args.push('-resize', dims + (comp ? '^' : '!'));
	args.push('-gamma', '2.2', '-background', o.bg);
	if (comp)
		args.push(o.composite, '-layers', 'flatten', '-extent', dims);
	else
		args.push('-layers', 'mosaic', '+matte');
	args.push('-strip', '-quality', o.quality, comp ? o.compDest : o.dest);
	im.convert(args, im_callback.bind(null, callback));
}

function im_callback(cb, err, stdout, stderr) {
	if (err) {
		console.error(stderr);
		return callback('Conversion error.');
	}
	if (config.DEBUG)
		setTimeout(cb, 1000);
	else
		cb();
}

IU.failure = function (err_desc) {
	this.form_call('upload_error', err_desc);
	var image = this.image;
	if (image) {
		if (image.path)
			fs.unlink(image.path);
		if (image.thumb_path)
			fs.unlink(image.thumb_path);
		if (image.comp_path)
			fs.unlink(image.comp_path);
	}
	if (this.client)
		this.client.uploading = false;
};

exports.image_attrs = ['src', 'thumb', 'dims', 'size', 'MD5', 'hash', 'imgnm',
		'spoiler', 'realthumb', 'vint'];

exports.is_image = function (image) {
	return image && (image.src || image.vint);
};

IU.publish = function () {
	var client = this.client;
	var view = {};
	var self = this;
	exports.image_attrs.forEach(function (key) {
		if (key in self.image)
			view[key] = self.image[key];
	});
	if (this.image.composite) {
		view.realthumb = view.thumb;
		view.thumb = this.image.composite;
	}
	if (client.post) {
		/* Text beat us here, discard alloc (if any) */
		client.db.add_image(client.post, view, client.ip,
					function (err) {
			if (err || !client.post)
				return self.failure("Publishing failure.");
			client.post.image = view;
			client.uploading = false;
			self.form_call('upload_complete', view);
		});
		return;
	}
	self.allocate_post(self.alloc, view, client, function (err, alloc) {
		if (err) {
			console.error(err);
			return self.failure('Bad post.');
		}
		client.uploading = false;
		self.form_call('on_allocation_wrapped', alloc);
	});
};

IU.form_call = function (func, param) {
	var resp = this.resp;
	if (this.json_response) {
		resp.writeHead(200, {'Content-Type': 'application/json'});
		resp.end(JSON.stringify({func: func, arg: param}));
		return;
	}
	param = param ? JSON.stringify(param) : '';
	resp.writeHead(200, {'Content-Type': 'text/html; charset=UTF-8'});
	resp.end('<!doctype html>\n<title></title>\n<script>'
		+ 'parent.postForm.' + func + '(' + param + ');</script>');
};
