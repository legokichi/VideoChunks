import * as $ from "jquery";

import * as Main from "./Component/VideoRecorder";
import {logger} from "./Util/util";

window["$"] = $; // for debug

//console.clear();

// 絶対エラー補足するくん
window.addEventListener("error", (ev: ErrorEvent)=>{
  logger(["## window.onerror ##", "name: "+ev.error.name, "message: "+ev.error.message, "stack: "+ev.error.stack].join("\n"), new Error);
});

$(()=>{
  Main.run($("body"));
});
