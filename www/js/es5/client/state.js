"use strict";System.register(["underscore","./memory","./util","./model","./collection"],function(e,n){var t,o,a,r,s,i,c,u,d,l,m,f,h,g,w,$,p,y,b;return{setters:[function(e){t=e.extend},function(e){o=e["default"]},function(e){a=e.randomID,r=e.getID},function(e){s=e["default"]},function(e){i=e["default"]}],execute:function(){function n(e){for(var n={board:e.match(/\/([a-zA-Z0-9]+?)\//)[1],thread:e.match(/\/(\d+)(:?#\d+)?(?:[\?&]\w+=\w+)*$/),lastN:e.match(/[\?&]last=(\d+)/)},t=["thread","lastN"],o=0;o<t.length;o++){var a=t[o],r=n[a];n[a]=r?parseInt(r[1]):0}return n}function t(){$threads.innerHTML="",models.each(function(e){return e.dispatch("stopListening")}),b.reset(),exports.syncs={},events.request("massExpander:unset")}function q(e){var n=r(e);return n?b.get(n):null}e("read",n),c=n(location.href),c.tabID=a(32),e("page",u=new s(c)),e("page",u),e("syncs",d={}),e("syncs",d),e("ownPosts",l={}),e("ownPosts",l),e("config",m=window.config),e("config",m),e("configHash",f=window.configHash),e("configHash",f),e("isMobile",h=window.isMobile),e("isMobile",h),e("$thread",g=document.query("threads")),e("$thread",g),e("$name",w=document.query("#name")),e("$name",w),e("$email",$=document.query("#email")),e("$email",$),e("$banner",p=document.query("#banner")),e("$banner",p),e("mine",y=new o("mine",2)),e("mine",y),e("posts",b=new i),e("posts",b),e("clear",t),e("getModel",q)}}});
//# sourceMappingURL=../maps/client/state.js.map