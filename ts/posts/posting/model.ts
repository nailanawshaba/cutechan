import { postEvent, postSM, postState } from ".";
import { ImageData, PostData } from "../../common";
import { handlers, message, send } from "../../connection";
import { loginID, sessionToken } from "../../mod";
import { page, posts, storeMine, storeSeenPost } from "../../state";
import { Dict, extend } from "../../util";
import { Post } from "../model";
import { FileData } from "./upload";
import FormView from "./view";

// Form Model of an OP post
export default class FormModel extends Post {
  public sentAllocRequest: boolean;
  public isAllocated: boolean;
  public nonLive = true;  // Disable live post updates
  public needCaptcha: boolean; // Need to solve a captcha to allocate

  // Text that is not submitted yet to defer post allocation
  public bufferedText: string;
  public bufferedFile: File; // Same for file uploads

  public inputBody = "";
  public view: FormView;
  private lasLinked: number; // ID of last linked post

  // Pass and ID, if you wish to hijack an existing model. To create a new
  // model pass zero.
  constructor() {
    // Initialize state
    super({
      auth: "",
      banned: false,
      body: "",
      deleted: false,
      editing: true,
      id: 0,
      op: page.thread,
      sticky: false,
      time: Math.floor(Date.now() / 1000),
    });
  }

  // Append a character to the model's body and reparse the line, if it's a
  // newline
  public append(code: number) {
    if (this.editing) {
      this.body += String.fromCodePoint(code);
    }
  }

  // Remove the last character from the model's body
  public backspace() {
    if (this.editing) {
      this.body = this.body.slice(0, -1);
    }
  }

  // Splice the last line of the body
  // public splice(msg: SpliceResponse) {
  //   if (this.editing) {
  //     this.spliceText(msg);
  //   }
  // }

  // Compare new value to old and generate appropriate commands
  public parseInput(val: string): void {
    // Handle live update toggling
    if (this.nonLive) {
      this.bufferedText = val;
      return;
    }

    // Remove any buffered quote, as we are committing now
    this.bufferedText = "";

    const old = this.inputBody;

    // Rendering hack shenanigans - ignore
    if (old === val) {
      return;
    }

    const lenDiff = val.length - old.length;
    const exceeding = old.length + lenDiff - 2000;

    // If exceeding max body length, shorten the value, trim input and try
    // again
    if (exceeding > 0) {
      this.view.trimInput(exceeding);
      return this.parseInput(val.slice(0, -exceeding));
    }

    // Remove any lines past 30
    const lines = val.split("\n");
    if (lines.length - 1 > 100) {
      const trimmed = lines.slice(0, 100).join("\n");
      this.view.trimInput(val.length - trimmed.length);
      return this.parseInput(trimmed);
    }

    if (!this.sentAllocRequest) {
      this.requestAlloc(val, null);
    } else if (lenDiff === 1 && val.slice(0, -1) === old) {
      this.commitChar(val.slice(-1));
    } else if (lenDiff === -1 && old.slice(0, -1) === val) {
      this.commitBackspace();
    } else {
      this.commitSplice(val);
    }
  }

  // Close the form and revert to regular post
  public commitClose() {
    // It is possible to have never committed anything, if all you have in
    // the body is one quote and an image allocated.
    if (this.bufferedText) {
      this.nonLive = false;
      this.parseInput(this.bufferedText);
    }

    this.body = this.inputBody;
    this.abandon();
    this.send(message.closePost, null);
  }

  // Turn post form into a regular post, because it has expired after a
  // period of posting ability loss
  public abandon() {
    this.view.cleanUp();
    // this.closePost();
  }

  // Add a link to the target post in the input
  public addReference(id: number, sel: string) {
    let s = "";
    const old = this.bufferedText || this.inputBody;
    const newLine = !old || old.endsWith("\n");
    const alreadyLinked = id === this.lasLinked;

    // Don't duplicate links, if quoting same post multiple times in
    // succession
    if (!alreadyLinked) {
      if (!newLine) {
        if (sel) {
          s += "\n";
        } else if (old[old.length - 1] !== " ") {
          s += " ";
        }
      }
      s += `>>${id} `;
    }
    this.lasLinked = id;

    if (!sel) {
      // If starting from a new line, insert newline after post
      if (newLine) {
        s += "\n";
      }
    } else {
      if (!alreadyLinked || !newLine) {
        s += "\n";
      }
      for (const line of sel.split("\n")) {
        s += ">" + line + "\n";
      }
    }

    // Don't commit a quote, if it is the first input in a post
    let commit = true;
    if (!this.sentAllocRequest && !this.bufferedText) {
      commit = false;
    }
    this.view.replaceText(old + s, commit);

    // Makes sure the quote is committed later, if it is the first input in
    // the post
    if (!commit) {
      this.bufferedText = s;
    }
  }

  // Commit a post made with live updates disabled
  public async commitNonLive() {
    if (!this.bufferedText && !this.bufferedFile) {
      return postSM.feed(postEvent.done);
    }

    this.sentAllocRequest = true;

    const req = this.newAllocRequest();
    if (this.bufferedFile) {
      req.image = await this.view.upload.uploadFile(this.bufferedFile);
    }
    if (this.bufferedText) {
      req.body = this.body = this.bufferedText;
    }

    send(message.insertPost, req);
    handlers[message.postID] = this.receiveID(false);
  }

  // Handle draft post allocation
  public onAllocation(data: PostData) {
    // May sometimes be called multiple times, because of reconnects
    if (this.isAllocated) {
      return;
    }

    this.isAllocated = true;
    extend(this, data);
    // this.view.renderAlloc()
    // if (data.image) {
    //   this.insertImage(this.image)
    // }
    if (this.nonLive) {
      this.propagateLinks();
      postSM.feed(postEvent.done);
    }
  }

  // Upload the file and request its allocation
  public async uploadFile(file?: File) {
    // Need a captcha and none submitted. Protects from no-captcha drops
    // allocating post too soon.
    if (this.needCaptcha) {
      if (file) {
        this.bufferedFile = file;
      }
      return;
    }

    if (this.nonLive) {
      this.bufferedFile = file || this.view.upload.input.files[0];
      return;
    }

    // Already have image or not in live mode
    if (this.image) {
      return;
    }

    const data = await this.view.upload.uploadFile(file);
    // Upload failed, canceled, image added while thumbnailing or post
    // closed
    if (!data || this.image || !this.editing) {
      return;
    }

    if (!this.sentAllocRequest) {
      this.requestAlloc(null, data);
    } else {
      send(message.insertImage, data);
    }
  }

  // Insert the uploaded image into the model
  public insertImage(img: ImageData) {
    this.image = img;
    this.view.insertImage();
  }

  // Commit a character appendage to the end of the line to the server
  private commitChar(char: string) {
    this.inputBody += char;
    this.send(message.append, char.codePointAt(0));
  }

  // Optionally buffer all data, if currently disconnected
  private send(type: message, msg: any) {
    if (postSM.state !== postState.halted) {
      send(type, msg);
    }
  }

  // Send a message about removing the last character of the line to the
  // server
  private commitBackspace() {
    this.inputBody = this.inputBody.slice(0, -1);
    this.send(message.backspace, null);
  }

  // Commit any other input change that is not an append or backspace
  private commitSplice(v: string) {
    // Convert to arrays of chars to deal with multibyte unicode chars
    const old = [...this.inputBody];
    const val = [...v];
    const start = diffIndex(old, val);
    const till = diffIndex(old.slice(start).reverse(), val.slice(start).reverse());

    this.send(message.splice, {
      len: old.length - till - start,
      start,
      // `|| undefined` ensures we never slice the string as [:0]
      text: val.slice(start, -till || undefined).join(""),
    });
    this.inputBody = v;
  }

  private newAllocRequest(): Dict {
    const req = {password: ""};
    if (this.auth) {
      extend(req, {
        session: sessionToken(),
        userID: loginID(),
      });
    }
    return req;
  }

  // Returns a function, that handles a message from the server, containing
  // the ID of the allocated post.
  // alloc specifies, if an alloc event should be fired on the state machine.
  private receiveID(alloc: boolean): (id: number) => void {
    return (id: number) => {
      this.id = id;
      this.op = page.thread;
      // this.seenOnce = true
      if (alloc) {
        postSM.feed(postEvent.alloc);
      }
      storeSeenPost(this.id, this.op);
      storeMine(this.id, this.op);
      posts.add(this);
      delete handlers[message.postID];
    };
  }

  // Request allocation of a draft post to the server
  private requestAlloc(body: string | null, image: FileData | null) {
    const req = this.newAllocRequest();

    // this.view.setEditing(true)
    this.nonLive = false;
    this.sentAllocRequest = true;

    req.open = !this.nonLive;
    if (body) {
      req.body = body;
      this.body = body;
      this.inputBody = body;
    }
    if (image) {
      req.image = image;
    }

    send(message.insertPost, req);
    handlers[message.postID] = this.receiveID(true);
  }
}

// Find the first differing character in 2 character arrays
function diffIndex(a: string[], b: string[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return a.length;
}
