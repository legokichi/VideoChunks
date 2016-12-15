import * as $ from "jquery";

import * as Main from "./Component/Main";
import {logger} from "./Util/util";

window["$"] = $; // for debug

//console.clear();

// 絶対エラー補足するくん
window.addEventListener("error", (ev: ErrorEvent)=>{
  logger(ev.error.message, new Error);
  logger(ev.error.stack  , new Error);
});

$(()=>{
  Main.run($("body"));
});
