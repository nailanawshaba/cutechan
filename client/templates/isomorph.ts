// MUST BE KEPT IN SYNC WITH go/src/meguca/templates/isomorph.go!
// Template structs, helper routines and context providers.
// TODO(Kagami): Move helper function here?

import { ln } from "../lang"
import {
	Thread, Post, Backlinks,
	thumbPath, sourcePath, duration, fileSize,
	parseBody,
} from "../posts"
import { TemplateContext, Ctx } from "../util"

// TODO(Kagami): Capitalize model keys for better compatibility?
export function makePostContext(t: Thread, p: Post, bls: Backlinks, index: boolean): TemplateContext {
	const ctx: Ctx = {
		ID: p.id,
		TID: t.id,
		Index: index,
		OP: t.id == p.id,
		Board: p.board,
		Subject: p.subject,
		Staff: p.auth != "",
		Auth: ln.Common.Posts[p.auth],
		Banned: p.banned,
		LBanned: ln.Common.Posts["banned"],
		LReplies: ln.Common.UI["replies"],
		backlinks: bls,
		post: p,
	}

	ctx.PostClass = () => {
		const classes = ["post"]
		if (ctx.OP) {
			classes.push("post_op")
		}
		if (ctx.post.image) {
			classes.push("post_media")
		}
		return classes.join(" ")
	}

	ctx.URL = () => {
		let url = ""
		if (!ctx.OP) {
			url = `#${ctx.ID}`
		}
		if (ctx.Index) {
			url = `/${ctx.Board}/${ctx.TID}${url}`
		}
		return url
	}

	// NOOP because we need to re-render based on relativeTime setting.
	ctx.Time = ""

	ctx.Media = () => {
		if (!ctx.post.image) return ""
		const img = ctx.post.image
		return new TemplateContext("post-media", {
			HasArtist: !!img.artist,
			Artist: img.artist,
			HasTitle: !!img.title,
			Title: img.title,
			HasAudio: img.audio,
			HasLength: !!img.length,
			Length: duration(img.length),
			Size: fileSize(img.size),
			TWidth: img.dims[0],
			THeight: img.dims[1],
			Width: img.dims[2],
			Height: img.dims[3],
			SourcePath: sourcePath(img.fileType, img.SHA1),
			ThumbPath: thumbPath(img.thumbType, img.SHA1),
		}).render()
	}

	ctx.Body = parseBody(ctx.post)

	// NOOP because we will need to update already rendered posts so avoid
	// code duplication.
	ctx.Backlinks = false

	return new TemplateContext("post", ctx)
}