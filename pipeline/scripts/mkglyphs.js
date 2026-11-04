const fontnik=require('fontnik'),fs=require('fs'),path=require('path');
const out=process.argv[2];
const faces={'Overpass Regular':'Overpass-Regular.ttf','Overpass SemiBold':'Overpass-SemiBold.ttf','Overpass Bold':'Overpass-Bold.ttf','Overpass Italic':'Overpass-Italic.ttf'};
(async()=>{for(const [name,file] of Object.entries(faces)){const buf=fs.readFileSync(file);const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
 for(let start=0;start<1024;start+=256){const end=start+255;const pbf=await new Promise((res,rej)=>fontnik.range({font:buf,start,end},(e,d)=>e?rej(e):res(d)));
  // only write ranges that have glyphs beyond Latin: write first 4 ranges always, others only if non-trivial
  if(start<1024) fs.writeFileSync(path.join(dir,`${start}-${end}.pbf`),pbf);}
 console.log(name, fs.readdirSync(dir).length,'ranges');}})();
