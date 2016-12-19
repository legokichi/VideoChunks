
import {EventEmitter} from "events";

import {dump} from "duxca.lib.js/lib/Algorithm";
import {getThumbnail, getVideoFromMediaStream} from "duxca.lib.js/lib/Media";
import {createVideoCanvasRenderer} from "duxca.lib.js/lib/Canvas";



export function getThumbnails(video: HTMLVideoElement, period: number): Promise<Blob[]> {
  const times: number[] = [];
  if( ! Number.isFinite(video.duration) ){
    return Promise.reject<Blob[]>(new Error("video duration is not finite"));
  }
  for(let currentTime=0; currentTime < video.duration; currentTime+=period){
    times.push(currentTime);
  }
  const thumbs = times
    .map((currentTime)=> (lst: Blob[])=> getThumbnail(video, currentTime).then((blob)=> lst.concat(blob) )  )
    .reduce<Promise<Blob[]>>((prm, genPrm)=> prm.then(genPrm), Promise.resolve([]));
  return thumbs;
}


export function elogger(err: Error){
  return (a: string|Error)=>{
    logger(a, err);
  };
}

export function logger(str: string|Error, err?: Error){
  if(err != null && err.stack != null){
    err.stack.split("\n").slice(1,2)
    .forEach((match)=>{ 
      const lineInfo = match.trim();
      log(str, lineInfo);
    });
  }else{
    log(str);
  }
  function log(obj: any, lineInfo?: string){
    let str = " ";
    if(typeof obj === "object"){
      try{
        str = ` ${dump(obj, 2)} `;
      }catch(err){}
    }
    if(typeof lineInfo === "string"){
      console.log(obj, lineInfo);
      $("#log").append(`${obj}${str}${lineInfo}\n`);
    }else{
      console.log(obj);
      $("#log").append(`${obj}${str}\n`);
    }
  }
}


export function getStorage(){
  return {
    get: <T>(key: string, _default: string): string => { return localStorage[key] != null ? localStorage[key] : _default; },
    set: <T>(key: string, value: string)=>{ localStorage[key] = value; },
    keys: ()=>{
      const results: string[] = [];
      for (let i=0; i<localStorage.length; i++){
          results.push(<string>localStorage.getItem(<string>localStorage.key(i)));
      }
      return results;
    }
  };
}

