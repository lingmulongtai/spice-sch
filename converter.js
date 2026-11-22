// Plain scripts also run from a local file without a web server.
const SpiceSch = (() => {
  const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:meg|mil|[tgkmunpf])?(?:ohm|hz|v|a|h|f)?$/i;
  const identifier = /^[a-z0-9_][a-z0-9_]{0,23}$/i;
  function parse(source) {
    const parts = [], notes = [], names = new Set();
    let ended = false, analysis = null;
    const lines = source.trimStart().split(/\r?\n/);
    if (source.length > 65536) throw Error('入力は64 KBまでです。');
    // SPICE reserves the first physical line for the circuit title.
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(';')[0].trim();
      if (!row || row.startsWith('*')) continue;
      const fail = message => { throw Error(`${i + 1}行目　${message}`); };
      if (ended) fail('.END の後に命令があります。');
      const [ref, ...args] = row.split(/\s+/);
      if (/^\.end$/i.test(row)) { ended = true; continue; }
      if (/^\.print\s/i.test(row)) { notes.push(`${i+1}行目の .PRINT は回路図に含まれません。`); continue; }
      if (/^\.ac$/i.test(ref)) {
        if (analysis || args.length !== 4 || args[0].toUpperCase() !== 'DEC' ||
            !/^[1-9]\d*$/.test(args[1]) || !args.slice(2).every(v => number.test(v))) fail('.AC DEC 点数 開始 終了 の形式を確認してください。');
        analysis = args.slice(1); continue;
      }
      const kind = ref[0].toUpperCase();
      if (!['R','L','C','V','E'].includes(kind) || !identifier.test(ref)) fail(`未対応の命令または部品「${ref}」です。`);
      if (names.has(ref.toUpperCase())) fail(`部品名「${ref}」が重複しています。`);
      names.add(ref.toUpperCase());
      const count = kind === 'E' ? 4 : 2;
      const pins = args.slice(0,count).map(n => n.toLowerCase());
      if (pins.length !== count || !pins.every(n => identifier.test(n))) fail('端子のノード名を確認してください。');
      const value = args.slice(count).join(' ');
      let symbol = kind, attrs;
      if (kind === 'V') {
        const match = /^(?:(?:DC\s+)?([^\s()]+)(?:\s+|$))?(?:AC\s+([^\s()]+)(?:\s+|$))?(?:SIN\(\s*([^()]+?)\s*\))?$/i.exec(value);
        if (!match || !value) fail('電圧源は DC、AC、SIN(offset amplitude frequency) に対応しています。');
        const [,dc,ac,sin] = match;
        const wave = sin?.split(/[\s,]+/);
        if ([dc,ac,...(wave || [])].some(v => v !== undefined && !number.test(v)) || (wave && wave.length !== 3)) fail('電圧源の数値または波形が未対応です。');
        symbol = wave ? 'VSIN' : ac ? 'VAC' : 'VDC';
        attrs = {};
        if (dc) attrs.DC = dc;
        if (ac) attrs[wave ? 'AC' : 'ACMAG'] = ac;
        if (wave) [attrs.VOFF,attrs.VAMPL,attrs.FREQ] = wave;
      } else {
        if (!number.test(value)) fail('値を数値とSPICE単位で入力してください。');
        attrs = { [kind === 'E' ? 'GAIN' : 'VALUE']: value };
      }
      parts.push({ref, symbol, kind, pins, attrs, value});
    }
    if (!parts.length) throw Error('1行目にタイトル、2行目以降に部品を入力してください。');
    if (!parts.some(p => p.pins.includes('0'))) throw Error('接地ノード 0 が必要です。');
    if (parts.length > 20 || new Set(parts.flatMap(p => p.pins)).size > 24) throw Error('1枚の回路図には20部品・24ノードまで配置できます。');
    return {parts, notes, analysis};
  }

  function layout(model) {
    const nets = new Map(), ports = [], parts = [];
    let next = 1;
    function wire(node) {
      if (!nets.has(node)) nets.set(node,{node,id:next++,segments:[],joins:[],taps:[]});
      return nets.get(node);
    }
    function path(net, points) {
      for (let i=1;i<points.length;i++) net.segments.push([...points[i-1],...points[i],next++]);
    }
    // Fold a three-element RC loop into its conventional laboratory layout.
    const src=model.parts.find(p=>p.kind==='V'), r=model.parts.find(p=>p.kind==='R'), c=model.parts.find(p=>p.kind==='C');
    if (model.parts.length===3 && src && r && c && src.pins[1]==='0' && c.pins[1]==='0' &&
        src.pins[0]===r.pins[0] && r.pins[1]===c.pins[0] && new Set(['0',...r.pins]).size===3) {
      for (const [p,x,y] of [[src,60,110],[r,160,72],[c,280,124]]) parts.push({...p,x,y,id:next++});
      const [v,res,cap]=parts;
      function run(node,points,joins) {
        const n=wire(node); path(n,points); n.joins.push(...joins);
      }
      run(r.pins[0],[[60,110],[60,72],[160,72]],[[60,110,`p ${v.id} +`],[160,72,`p ${res.id} 1`]]);
      run(r.pins[1],[[200,72],[280,72],[280,124]],[[200,72,`p ${res.id} 2`],[280,124,`p ${cap.id} 1`]]);
      run('0',[[310,124],[336,124],[336,196],[60,196],[60,150]],[[310,124,`p ${cap.id} 2`],[60,150,`p ${v.id} -`]]);
      const ground=wire('0'), id=next++;
      path(ground,[[60,196],[60,216]]); ports.push({id,x:60,y:216});
      ground.joins.push([60,216,`s ${id}`]); ground.branches=[[60,196]];
      return {...model,parts,nets:[...nets.values()],ports,next,width:400,height:260};
    }
    for (const p of model.parts) p.pins.forEach(wire);
    const x = 100 + nets.size * 32;
    model.parts.forEach((p,index) => {
      const y = 80 + index*80, id = next++;
      const part = {...p,x,y,id};
      parts.push(part);
      let pins;
      if (p.kind === 'E') pins = [[40,0,'3',1],[40,10,'4',1],[0,0,'1',-1],[0,10,'2',-1]];
      else if (p.kind === 'V') pins = [[0,0,'+',-1],[0,40,'-',-1]];
      else pins = [[0,0,'1',-1],[{R:40,C:30,L:60}[p.kind],0,'2',1]];
      pins.forEach(([dx,dy,pin,side],i) => {
        const net = wire(p.pins[i]), px = x+dx, py=y+dy;
        const rail = 40 + [...nets.keys()].indexOf(net.node)*32;
        const points = [[px,py]];
        let ty = py;
        if (side === 1) {
          // Outer positive lead passes below the inner negative lead.
          const right = px + (i===0 ? 60 : 32);
          ty = y + (i===0 ? 64 : 44);
          points.push([right,py],[right,ty]);
        }
        points.push([rail,ty]); path(net,points);
        net.taps.push([rail,ty]);
        net.joins.push([px,py,`p ${id} ${pin}`]);
      });
    });
    for (const net of nets.values()) {
      net.taps.sort((a,b) => a[1]-b[1]);
      if (net.node === '0') {
        const [rx,ry] = net.taps.at(-1), id=next++;
        net.taps.push([rx,ry+24]); ports.push({id,x:rx,y:ry+24});
        net.joins.push([rx,ry+24,`s ${id}`]);
      }
      path(net,net.taps);
    }
    return {parts, nets:[...nets.values()],ports,next,width:x+180,height:160+80*(parts.length-1),analysis:model.analysis,notes:model.notes};
  }

  function serialize(d) {
    const page=['*page 1 0 594 420 ma','@ports'];
    for (const p of d.ports) page.push(`port ${p.id} EGND ${p.x} ${p.y} h`);
    page.push('@parts');
    for (const p of d.parts) {
      page.push(`part ${p.id} ${p.symbol} ${p.x} ${p.y} h`,
        `a 0 a 0:13 0 0 0 hln 100 PKGREF=${p.ref}`,
        `a 0 ap 9 0 12 -12 hln 100 REFDES=${p.ref}`);
      for (const [key,value] of Object.entries(p.attrs)) page.push(`a 0 u ${key==='VALUE'?'13':'0'} 0 12 23 hln 100 ${key}=${value}`);
    }
    page.push('@conn');
    for (const net of d.nets) {
      page.push(`w ${net.id}`,`a 0 sr 0 0 0 0 hln 100 LABEL=${net.node}`);
      for (const seg of net.segments) page.push('s '+seg.join(' '));
    }
    page.push('@junction');
    for (const n of d.nets) {
      for (const [x,y,ref] of n.joins) page.push(`j ${x} ${y}`,`+ ${ref}`,`+ w ${n.id}`);
      for (const [x,y] of n.branches ?? n.taps.slice(1,-1)) page.push(`j ${x} ${y}`,`+ w ${n.id}`,`+ w ${n.id}`);
    }
    page.push('@attributes','a 0 s 0:13 0 0 0 hln 100 PAGESIZE=A2','@graphics','');
    const body=page.join('\n');
    const header=['*version 8.0 0',`u ${d.next}`];
    const counters=new Map();
    for (const p of d.parts) {
      const numeric=/^[a-z](\d{1,8})$/i.exec(p.ref);
      counters.set(p.kind,Math.max(counters.get(p.kind) || 1,numeric ? Number(numeric[1])+1 : 1));
    }
    for (const [kind,next] of counters) header.push(`${kind}? ${next}`);
    header.push('@libraries','@analysis');
    if (d.analysis) header.push('.AC 1 3 0',...d.analysis.map((v,i)=>`+${i} ${v}`));
    header.push('@targets','@attributes','@translators','a 0 u 13 0 0 0 hln 100 PSPICE=PSPICE','@setup','connectViaLabel 0','@index',`pageloc 1 0 ${body.length} `,'@status','');
    return header.join('\n')+body;
  }
  return {parse,layout,serialize};
})();
if (typeof module !== 'undefined') module.exports = SpiceSch;
