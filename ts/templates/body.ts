/**
 * Post formatting renderer.
 */
// MUST BE KEPT IN SYNC WITH go/src/meguca/templates/body.go!

import * as marked from "marked"
import { escape } from "../util"
import { PostData, PostLink, TextState } from "../common"
import { renderPostLink } from "."  // TODO(Kagami): Avoid circular import

type AnyClass = { new(...args: any[]): any }

function noop() {}
;(noop as any).exec = noop

// Verify and render a link to other posts.
function postLink(m: RegExpMatchArray, links: [PostLink], thread: number): string {
  if (!links) return escape(m[0])

  const id = +m[0].slice(2)
  const link = links.find(l => l[0] === id)
  if (!link) return escape(m[0])

  return renderPostLink(id, link[1], thread)
}

class CustomLexer extends ((marked as any).Lexer as AnyClass) {
  constructor(options: any) {
    super(options)
    // TODO(Kagami): Remove def from regexes?
    Object.assign(this.rules, {
      code: noop,
      hr: noop,
      heading: noop,
      lheading: noop,
      blockquote: /^( *>[^>\n][^\n]*)/,
      def: noop,
    })
  }
}

class CustomInlineLexer extends ((marked as any).InlineLexer as AnyClass) {
  constructor(links: any, options: any, post: PostData) {
    // XXX(Kagami): Inject post link logic via hardcoded link defs.
    // Hacky, but unfortunately marked can't be easily extended.
    links[""] = {href: "post-link", title: ""}
    super(links, options)
    this.post = post
    const textSrc = this.rules.text.source
    Object.assign(this.rules, {
      link: noop,
      reflink: /^>>\d+()/,
      nolink: noop,
      del: /^%%(?=\S)([\s\S]*?\S)%%/,
      text: new RegExp(textSrc.replace("]|", "%]|")),
    })
  }
  outputLink(cap: any, link: any) {
    if (link.href === "post-link") {
      return postLink(cap, this.post.links, this.post.op)
    }
    return super.outputLink(cap, link)
  }
}

class CustomParser extends ((marked as any).Parser as AnyClass) {
  parse(src: any, post: PostData) {
    this.inline = new CustomInlineLexer(src.links, this.options, post)
    this.tokens = src.reverse()

    let out = ""
    while (this.next()) {
      out += this.tok()
    }

    return out
  }
}

class CustomRenderer extends marked.Renderer {
  blockquote(quote: string): string {
    return "<blockquote>&gt; " + quote + "</blockquote>"
  }
  // paragraph(text: string): string {
  //   return text
  // }
}

// Render post body Markdown to sanitized HTML.
export function render(post: PostData): string {
  const options = Object.assign({}, (marked as any).defaults, {
    // gfm: true,
    tables: false,
    breaks: true,
    // pedantic: false,
    sanitize: true,  // Very important!
    // sanitizer: null,
    // mangle: true,
    // smartLists: false,
    // silent: false,
    // highlight: null,
    // langPrefix: 'lang-',
    // smartypants: false,
    // headerPrefix: '',
    renderer: new CustomRenderer(),
    // xhtml: false
  })
  const lexer = new CustomLexer(options)
  const tokens = lexer.lex(post.body)
  const parser = new CustomParser(options)
  return parser.parse(tokens, post)
}

// Render the text body of a post
export default function(data: PostData): string {
  const state: TextState = data.state = {
    spoiler: false,
    quote: false,
    lastLineEmpty: false,
    code: false,
  }
  let html = ""

  const fn = parseTerminatedLine,
    lines = data.body.split("\n"),
    last = lines.length - 1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]

    // Prevent successive empty lines
    if (!l.length) {
      // Don't break, if body ends with newline
      if (!state.lastLineEmpty && i !== last) {
        html += "<br>"
      }
      state.lastLineEmpty = true
      state.quote = false
      continue
    }

    html += initLine(l, state)
      + fn(l, data)
      + terminateTags(state, i != last)
  }

  return html
}

// Parse a single line, that is no longer being edited
function parseTerminatedLine(line: string, data: PostData): string {
  return parseCode(line, data.state, frag =>
    parseFragment(frag, data))
}

// Detect code tags
function parseCode(
  frag: string,
  state: TextState,
  fn: (frag: string) => string,
): string {
  let html = ""
  while (true) {
    const i = frag.indexOf("``")
    if (i !== -1) {
      html += formatCode(frag.slice(0, i), state, fn)
      frag = frag.substring(i + 2)
      state.code = !state.code
    } else {
      html += formatCode(frag, state, fn)
      break
    }
  }
  return html
}

function formatCode(
  frag: string,
  state: TextState,
  fn: (frag: string) => string,
): string {
  return parseSpoilers(frag, state, fn)
}

// Injects spoiler tags and calls fn on the remaining parts
function parseSpoilers(
  frag: string,
  state: TextState,
  fn: (frag: string) => string,
): string {
  let html = ""
  while (true) {
    const i = frag.indexOf("**")
    if (i !== -1) {
      html += fn(frag.slice(0, i))
      if (state.quote) {
        html += "</em>"
      }
      html += `<${state.spoiler ? '/' : ''}del>`
      if (state.quote) {
        html += "<em>"
      }

      state.spoiler = !state.spoiler
      frag = frag.substring(i + 2)
    } else {
      html += fn(frag)
      break
    }
  }
  return html
}

// Open a new line container and check for quotes
function initLine(line: string, state: TextState): string {
  let html = ""
  state.quote = state.lastLineEmpty = false
  if (line[0] === ">") {
    state.quote = true
    html += "<em>"
  }
  if (state.spoiler) {
    html += "<del>"
  }
  return html
}

// Close all open tags at line end
function terminateTags(state: TextState, newLine: boolean): string {
  let html = ""
  if (state.spoiler) {
    html += "</del>"
  }
  if (state.quote) {
    html += "</em>"
  }
  if (newLine) {
    html += "<br>"
  }
  return html
}

// Parse a line fragment
function parseFragment(frag: string, data: PostData): string {
  let html = ""
  const words = frag.split(" ")
  for (let i = 0; i < words.length; i++) {
    if (i !== 0) {
      html += " "
    }

    // Split leading and trailing punctuation, if any
    const [leadPunct, word, trailPunct] = ["", words[i], ""]
    if (leadPunct) {
      html += leadPunct
    }
    if (!word) {
      if (trailPunct) {
        html += trailPunct
      }
      continue
    }

    let matched = false
    switch (word[0]) {
      case ">":
        // // Post links
        // m = word.match(/^>>(>*)(\d+)$/)
        // if (m) {
        //   html += parsePostLink(m, data.links, data.op)
        //   matched = true
        // }
        // break
      default:
        // Generic HTTP(S) URLs, magnet links and embeds
        // Checking the first byte is much cheaper than a function call.
        // Do that first, as most cases won't match.
        // const pre = urlPrefixes[word[0]]
        // if (pre && word.startsWith(pre)) {
        //   html += parseURL(word)
        //   matched = true
        // }
    }

    if (!matched) {
      html += escape(word)
    }
    if (trailPunct) {
      html += trailPunct
    }
  }

  return html
}

// Render and anchor link that opens in a new tab
// function newTabLink(href: string, text: string): string {
//   const attrs = {
//     rel: "noreferrer",
//     href: escape(href),
//     target: "_blank",
//   }
//   return `<a ${makeAttrs(attrs)}>${escape(text)}</a>`
// }

// Parse generic URLs and embed, if applicable
// function parseURL(bit: string): string {
//   const embed = parseEmbeds(bit)
//   if (embed) {
//     return embed
//   }

//   try {
//     new URL(bit) // Will throw, if invalid URL
//     if (bit[0] == "m") { // Don't open a new tab for magnet links
//       bit = escape(bit)
//       return bit.link(bit)
//     }
//     return newTabLink(bit, bit)
//   } catch (e) {
//     return escape(bit)
//   }
// }