const examples = {
  "rc": "RC low-pass filter\n\n* Input and filter\nV1 in 0 AC 1\nR1 in out 1k\nC1 out 0 100n\n\n.AC DEC 20 10 100k\n.END",
  "amp": "TDA2050 Figure 4 - small-signal feedback analysis\n* Linear high-gain amplifier approximation. No rail limiting or IC bandwidth.\n* Supplies and bypass branches document Fig. 4; EAMP is independently powered.\nVPLUS vcc 0 18\nVMINUS vee 0 -18\nC3 vcc 0 100n\nC5 vcc 0 220u\nC4 vee 0 100n\nC6 vee 0 220u\nVIN input 0 AC 1 SIN(0 0.1 1k)\nC1 input plus 1u\nR1 plus 0 22k\nEAMP out 0 plus minus 100000\nR3 out minus 22k\nR2 minus fb 680\nC2 fb 0 22u\nR4 out zobel 2.2\nC7 zobel 0 0.47u\nRL out 0 8\n.AC DEC 10 1 100k\n.PRINT AC VM(out)\n.END\n"
};
const el = id => document.getElementById(id);
const editor=el('editor'), drawing=el('drawing');
let result, filename='rc-lowpass', large=false;
function vector(tag,attrs,text) {
  const n=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,v);
  if(text!==undefined) n.textContent=text;
  drawing.append(n);
}
function trace(d,color='#124fd1') { vector('path',{d,fill:'none',stroke:color,'stroke-width':1.6,'stroke-linejoin':'round'}); }
function label(x,y,text,size=8,color='#313e54') {vector('text',{x,y,fill:color,'font-size':size,'font-family':'Menlo, monospace'},text);}
function paint(d) {
  drawing.replaceChildren();
  drawing.setAttribute('viewBox',`0 0 ${d.width} ${d.height}`);
  drawing.classList.toggle('large',large);
  drawing.style.height=large?d.height*2+'px':'100%';
  drawing.style.width=large?d.width*2+'px':'100%';
  for(const n of d.nets) {
    for (const [x,y,a,b] of n.segments) trace(`M${x} ${y}L${a} ${b}`);
    for (const [x,y] of n.taps.slice(1,-1)) vector('circle',{cx:x,cy:y,r:2.6,fill:'#124fd1'});
    if(n.node!=='0'){
      const [x,y,a,b]=n.segments[0];
      label((x+a)/2+3,(y+b)/2-5,n.node,8,'#124fd1');
    }
  }
  for(const {x,y} of d.ports)trace(`M${x-8} ${y}h16m-13 3h10m-7 3h4`);
  for(const {x,y,kind,ref,value} of d.parts) {
    const origin=`M${x} ${y}`;
    const shapes={R:'h8l3 -5 4 10 4 -10 4 10 4 -10 4 10 3 -5h6',C:'h13m0 -8v16m5 -16v16m0 -8h12',L:'h6'+('a6 6 0 0 1 12 0').repeat(4)+'h6',V:'v7m0 26v7',E:'h8m24 0h8m-40 10h8m24 0h8m-32 -16h24v22h-24z'};
    trace(origin+shapes[kind],'#172a43');
    if(kind==='V'){
      vector('circle',{cx:x,cy:y+20,r:13,fill:'#f2f6fc',stroke:'#172a43','stroke-width':1.6});label(x-3,y+17,'+');label(x-3,y+28,'−');
    }
    label(x+(kind==='V'?20:4),y-10,ref,10);
    label(x+(kind==='V'?20:4),y+(kind==='V'?23:23),value,8);
  }
}
function refresh() {
  el('numbers').textContent=editor.value.split('\n').map((_,i)=>i+1).join('\n');
  try {
    result=SpiceSch.layout(SpiceSch.parse(editor.value));
    paint(result);
    el('status').textContent=`${result.parts.length} 部品　/　${result.nets.length} ノード`;
    el('notice').textContent=result.notes.join('\n');
  } catch(err) {
    result=null;drawing.replaceChildren();el('status').textContent='入力を確認してください';el('notice').textContent=err.message;
  }
  el('download').disabled=!result; el('zoom').disabled=!result;
}
function loadExample(key) {
  editor.value=examples[key];filename=key==='rc'?'rc-lowpass':'TDA2050';refresh();
}
el('sample').onchange=e=>loadExample(e.target.value);
editor.oninput=()=>{el('sample').value='custom';refresh();};
editor.onscroll=()=>{el('numbers').scrollTop=editor.scrollTop;};
el('open').onclick=()=>el('file').click();
el('file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {
    if(file.size>65536)throw Error('64 KB以下のファイルを選択してください。');
    editor.value=await file.text(); filename=file.name.replace(/\.[^.]+$/,'')||'circuit';el('sample').value='custom';refresh();
  } catch(err){el('notice').textContent=err.message;}
  e.target.value='';
};
el('zoom').onclick=()=>{
  large=!large;el('zoom').setAttribute('aria-pressed',String(large));el('zoom').textContent=large?'全体表示':'拡大';paint(result);
};
el('download').onclick=()=>{
  if(!result)return;
  const url=URL.createObjectURL(new Blob([SpiceSch.serialize(result)],{type:'application/octet-stream'}));
  const a=document.createElement('a');a.href=url;a.download=filename+'.sch';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
loadExample('rc');
