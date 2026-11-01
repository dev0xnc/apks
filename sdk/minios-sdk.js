(function(global){
"use strict";
var VERSION="0.1.0";
var allowed={now_ms:true,random:true,log:true};
function decodeBase64(value){
var clean=String(value).replace(/\s+/g,"");
var raw=global.atob(clean),bytes=new Uint8Array(raw.length);
for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
return bytes;
}
function hostImports(){
return {minios:{
now_ms:function(){return Date.now()|0;},
random:function(){return Math.random();},
log:function(){if(global.console&&console.log)console.log("[MiniOS WASM] módulo ejecutado");}
}};
}
async function loadWasm(path){
if(typeof WebAssembly!=="object")throw new Error("WebAssembly no está disponible.");
var appRoot=new URL("./",global.location.href);var moduleURL=new URL(path,global.location.href);if(moduleURL.origin!==global.location.origin||!moduleURL.pathname.startsWith(appRoot.pathname))throw new Error("La ruta WASM debe permanecer dentro de la carpeta de la aplicación.");var response=await fetch(moduleURL.href,{cache:"no-store"});
if(!response.ok)throw new Error("No se pudo descargar WASM: HTTP "+response.status);
var bytes=decodeBase64(await response.text());
var module=await WebAssembly.compile(bytes);
var imports=WebAssembly.Module.imports(module);
imports.forEach(function(item){
if(item.module!=="minios"||item.kind!=="function"||!allowed[item.name])throw new Error("Import WASM no permitido: "+item.module+"."+item.name);
});
return WebAssembly.instantiate(module,hostImports()).then(function(result){return result.instance;});
}
global.MiniOS=Object.freeze({
version:VERSION,
capabilities:Object.freeze({webAssembly:typeof WebAssembly==="object",webGL:(function(){try{var c=document.createElement("canvas");return !!(c.getContext("webgl")||c.getContext("experimental-webgl"));}catch(e){return false;}})()}),
wasm:Object.freeze({load:loadWasm})
});
})(window);
