"use strict";System.register([],function(n,e){function t(){a.state.page.get("catalog")?!function(){var n="hide"===f.get("thumbs")||a.oneeSama.workMode?"none":"";document.queryAll(".expanded").forEach(function(e){return e.style.display=n})}():s(function(){return r(function(n,e){return n&&e.dispatch("renderImage",n)})})}function r(n){m.each(function(e){return n(e.get("image"),e)})}function o(){s(function(){return r(function(n,e){return n&&n.spoiler&&e.dispatch("renderImage",n)})})}function i(){s(function(){return r(function(n,e){return n&&".gif"===n.ext&&e.dispatch("renderImage",n)})})}function u(n,e){s(function(){var n=e?"anonymise":"renderName";m.each(function(e){var t=e.attributes,r=t.name,o=t.trip;(r||o)&&e.dispatch(n)})})}var a,c,s,f,g,m;return{setters:[],execute:function(){a=require("./main"),c=a.util,s=a.follow,f=a.options,g=a.oneeSama,m=a.state.posts,f.on({"change:thumbs":t,"change:spoilers":o,"change:autogif":i,"change:anonymise":u,workModeTOG:t}),a.reply("loop:anonymise",function(){return f.get("anonymise")&&u(null,!0)})}}});
//# sourceMappingURL=../maps/client/loop.js.map