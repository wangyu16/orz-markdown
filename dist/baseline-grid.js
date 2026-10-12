"use strict";
/**
 * The baseline grid on screen (2.3.0, claim M.31; owner 2026-10-12: "the
 * playful-1 theme for orz-markdown and in orz-mdhtml should have the same
 * features [as orz-paged's print version]: all elements either 'write'
 * directly on the lines or in a container attached on top of the paper with
 * the ruled lines").
 *
 * A theme opts in by setting `--orz-grid` on the article (`.markdown-body`):
 * the line pitch, an absolute length equal to the body line height (only
 * `light-playful-1` does, inside `@media screen`). The theme draws the ruling
 * itself, as the article's background, from the content box top at that
 * pitch, and sets everything written on the lines in whole lines (pure CSS);
 * this pass supplies what CSS cannot know, for blocks of variable height:
 *
 * 1. `--orz-rule-at` on the article — where a body line's baseline falls in
 *    its line box, plus a small drop (the rule runs just under the letters),
 *    measured on a probe paragraph; `--orz-sh-<k>` / `--orz-mb-<k>` for the
 *    lined kinds (`h1`…`h6`, `fn` = the footnotes): the relative shift that
 *    puts a heading's baseline on a rule and the margin that ends it at the
 *    end of its last line (the theme's CSS applies them).
 * 2. Every top-level block of the article, in order, is one of four kinds
 *    (the same model as orz-paged's print handler, src/paged/baseline-grid.ts
 *    there): **text** (paragraphs, lists, the TOC, `::: center`/`right`) and
 *    **lined** (headings, rules, footnotes) start on a grid line; **math** (a
 *    display formula) starts on a grid line, its baseline is moved onto a rule
 *    and its height rounded up to whole lines; a **box** (anything else: a
 *    table, code, a callout, a quote, a picture, a diagram, columns, tabs, a
 *    spoiler, a QR block) is a sheet on top of the paper: it starts on a rule
 *    one blank line below the text above and is grown to end on a rule (the
 *    text after it back on the lines after one blank line). A written block
 *    whose height is still not a whole number of lines gets the class
 *    `orz-off-grid` (the theme hides the ruling behind it).
 *
 * How: one read of every block's layout box (transforms neutralised), then
 * one write of the margins and paddings that put them on the grid (positions
 * shift by what was added above), then one check; a document the arithmetic
 * does not predict (floats, clearance) is done again block by block. Every
 * inline style it sets is recorded and restored before the next run, so a run
 * is idempotent; `watch(root)` re-runs it (once per frame at most) when the
 * article's size changes (images, diagrams, tabs, a resize, a theme switch)
 * and when webfonts finish loading, and undoes it while the page prints. For an article whose theme
 * sets no `--orz-grid` a run reads one custom property and stops.
 *
 * ONE source for both places it runs: the preview frame (an inline script in
 * `getPreviewFrameAssets().bodyScripts()`, run by `__orzEnhance`) and a page
 * (`enhanceDocument` injects it once per window). Plain ES5 syntax in a
 * `String.raw` template: no backticks or `${` inside it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASELINE_GRID_SCRIPT = exports.GRID_ATTRIBUTE = exports.GRID_PICTURE_CLASS = exports.GRID_OFF_CLASS = void 0;
/** The class a written block gets when its lines are off the grid (the theme hides the ruling behind it). */
exports.GRID_OFF_CLASS = 'orz-off-grid';
/** The class a paragraph holding only a picture (an image, a QR code) gets: the theme sets it as a sheet. */
exports.GRID_PICTURE_CLASS = 'orz-picture';
/** The attribute an article carries while the grid is applied (its value: the pitch in CSS px). */
exports.GRID_ATTRIBUTE = 'data-orz-grid';
/**
 * The browser script that defines `window.OrzBaselineGrid` once per window:
 * `{ align(root), watch(root), release(root), stats(root) }`. `align` runs
 * the pass once (returns its stats, or `null` when the theme has no grid);
 * `watch` aligns and keeps the article aligned; `release` undoes it and
 * stops watching.
 */
exports.BASELINE_GRID_SCRIPT = String.raw `(function(){
'use strict';
var W=window,D=document;
try{if(typeof W.OrzBaselineGrid.watch==='function')return}catch(e){}
var EPS=0.5,ATTR='data-orz-grid',OFF='orz-off-grid',PICTURE='orz-picture';
var LINED=[['h1','<h1>X</h1>'],['h2','<h2>X</h2>'],['h3','<h3>X</h3>'],['h4','<h4>X</h4>'],['h5','<h5>X</h5>'],['h6','<h6>X</h6>'],
['fn','<section class="footnotes"><ol class="footnotes-list"><li class="footnote-item"><p>X</p></li></ol></section>']];
var states=new WeakMap(),watched=[];
function mod(x,m){return((x%m)+m)%m}
function num(v){var n=parseFloat(v);return isFinite(n)?n:0}
function cs(el){return W.getComputedStyle(el)}
function q64(n){return Math.round(n*64)/64}
function px(n){return q64(n)+'px'}
function state(root){var s=states.get(root);if(!s){s={set:[],cls:[],vars:{},stats:null,ro:null,raf:0,runs:0,at:0,late:0};states.set(root,s)}return s}
function put(s,el,prop,value){s.set.push([el,prop,el.style.getPropertyValue(prop),el.style.getPropertyPriority(prop)]);el.style.setProperty(prop,value)}
function addClass(s,el,c){if(!el.classList.contains(c)){el.classList.add(c);s.cls.push([el,c])}}
function reset(root,s){
for(var i=s.set.length-1;i>=0;i--){var r=s.set[i];if(r[2])r[0].style.setProperty(r[1],r[2],r[3]);else r[0].style.removeProperty(r[1])}
for(var j=0;j<s.cls.length;j++)s.cls[j][0].classList.remove(s.cls[j][1]);
s.set=[];s.cls=[];s.stats=null;
if(root.hasAttribute(ATTR))root.removeAttribute(ATTR)}
function mark(){var m=D.createElement('span');m.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline;';return m}
function baselineOf(holder){var m=mark();holder.insertBefore(m,holder.firstChild);try{return m.getClientRects().length?m.getBoundingClientRect().bottom:null}finally{m.remove()}}
/* the article's custom properties: kept from run to run and written only when they change (each write
   re-styles the whole article) */
function setVars(root,s,vals){
var k;for(k in s.vars)if(!(k in vals)){root.style.removeProperty(k);delete s.vars[k]}
for(k in vals)if(s.vars[k]!==vals[k]){root.style.setProperty(k,vals[k]);s.vars[k]=vals[k]}}
/* the probes, all in one layout: a paragraph styled like the article's (the pitch, and where a body line's
   baseline falls) and each lined kind (where its first baseline falls: the shift onto a rule, and the margin
   that ends it at the end of its last line) */
function probe(root){
var v;try{v=cs(root).getPropertyValue('--orz-grid')}catch(e){return null}
if(!v||!String(v).trim())return null;
var hidden='position:absolute;visibility:hidden;left:0;top:0;margin:0;transform:none;';
var p=D.createElement('p');p.setAttribute('aria-hidden','true');
p.style.cssText=hidden+'width:10em;padding:0;border:0;';
var m=mark(),pitch=D.createElement('span');
pitch.style.cssText='display:block;position:absolute;left:0;top:0;width:0;height:var(--orz-grid,0px);';
p.appendChild(m);p.appendChild(D.createTextNode('x'));p.appendChild(pitch);
var els=[p],marks=[],i;
for(i=0;i<LINED.length;i++){
var host=D.createElement('div');host.innerHTML=LINED[i][1];var el=host.firstElementChild;
el.setAttribute('aria-hidden','true');el.style.cssText=hidden+'width:30em;';
var holder=el;while(holder.firstElementChild)holder=holder.firstElementChild;
if(holder!==el)holder.style.setProperty('top','0px');
var hm=mark();holder.insertBefore(hm,holder.firstChild);
els.push(el);marks.push([hm,holder])}
for(i=0;i<els.length;i++)root.appendChild(els[i]);
try{
var r=p.getBoundingClientRect(),grid=pitch.getBoundingClientRect().height,css=num(cs(pitch).height);
if(!(grid>2)||!(css>0)||Math.abs(r.height-grid)>EPS)return null;
var z=grid/css,base=q64(m.getBoundingClientRect().bottom-r.top),em=num(cs(p).fontSize)||16;
var g={grid:grid,z:z,base:base,ruleAt:q64(Math.min(grid-z,base+Math.max(1,0.08*em)*z)),lined:[]};
for(i=0;i<LINED.length;i++){
var e=els[i+1],hb=marks[i][0];if(!hb.getClientRects().length)continue;
var er=e.getBoundingClientRect(),b=hb.getBoundingClientRect().bottom-er.top,h=er.height;
var pb=num(cs(e).paddingBottom)*z,lh=num(cs(marks[i][1]).lineHeight)*z;
if(!(lh>0)||Math.abs(lh/grid-Math.round(lh/grid))*grid>EPS)continue;
var d=mod(base-b,grid),shift=d>grid/2?d-grid:d;
g.lined.push(['--orz-sh-'+LINED[i][0],shift/z],['--orz-mb-'+LINED[i][0],(b+shift+(grid-base)+pb-h)/z])}
return g
}finally{for(i=0;i<els.length;i++)els[i].remove()}}
function isMath(el){return el.tagName==='P'&&(el.classList.contains('katex-block')||!!el.querySelector('.katex-display'))}
function isPicture(el){
if(el.tagName!=='P')return false;
var k=null,n;
for(n=el.firstChild;n;n=n.nextSibling){if(n.nodeType===3&&!/\S/.test(n.data))continue;if(k||n.nodeType!==1)return false;k=n}
if(!k)return false;
if(k.tagName==='A'&&k.children.length===1&&!/\S/.test(k.textContent||''))k=k.children[0];
return k.tagName==='IMG'||k.classList.contains('qrcode--standalone')}
function kindOf(el){
var t=el.tagName;
if(t==='P')return isMath(el)?'math':isPicture(el)?'box':'text';
if(t==='UL'||t==='OL'||t==='DL')return'text';
if(/^H[1-6]$/.test(t)||t==='HR')return'lined';
if(t==='SECTION'&&el.classList.contains('footnotes'))return'lined';
if(t==='DIV'&&(el.classList.contains('center')||el.classList.contains('right')))return'text';
return'box'}
function sheetsOf(el){
if(!el.classList.contains('cols'))return null;
var out=[];for(var c=el.firstElementChild;c;c=c.nextElementSibling)if(c.classList.contains('col'))out.push(c);return out}
/* layout boxes (transforms neutralised, relative shifts taken off), in content coordinates */
function measure(list,g,top0){
var undo=[],marks=[],i,j,t,res=[];
var plain=function(el){var c=cs(el);if(c.transform!=='none'){undo.push([el,el.style.getPropertyValue('transform'),el.style.getPropertyPriority('transform')]);el.style.setProperty('transform','none','important')}};
for(i=0;i<list.length;i++){
var el=list[i],sh=sheetsOf(el);plain(el);if(sh)for(j=0;j<sh.length;j++)plain(sh[j]);
if(isMath(el)){var hold=el.querySelector('.katex-display > .katex > .katex-html')||el.querySelector('.katex-display')||el;var m=mark();hold.insertBefore(m,hold.firstChild);marks[i]=[m,hold]}}
try{
var t0=top0();
var box=function(el){var c=cs(el),r=el.getBoundingClientRect(),dy=c.position==='relative'?num(c.top)*g.z:0;
return{el:el,top:r.top-dy-t0,bottom:r.bottom-dy-t0,height:r.height,mt:num(c.marginTop)*g.z,mb:num(c.marginBottom)*g.z,pb:num(c.paddingBottom)*g.z,cssPb:num(c.paddingBottom),cssH:num(c.height),byHeight:c.display==='table'||c.display==='inline-table'||(c.aspectRatio&&c.aspectRatio!=='auto')}};
for(i=0;i<list.length;i++){
var o=box(list[i]);o.kind=kindOf(list[i]);
var s2=sheetsOf(list[i]);if(s2){o.cols=[];for(j=0;j<s2.length;j++)o.cols.push(box(s2[j]))}
if(marks[i]){var mr=marks[i][0].getClientRects().length?marks[i][0].getBoundingClientRect():null,ink=marks[i][1].getBoundingClientRect();
o.baseline=mr?mr.bottom-t0:null;o.inkTop=ink.top-t0;o.inkBottom=ink.bottom-t0}
res.push(o)}
}finally{
for(i=0;i<marks.length;i++)if(marks[i])marks[i][0].remove();
for(i=undo.length-1;i>=0;i--){t=undo[i];if(t[1])t[0].style.setProperty('transform',t[1],t[2]);else t[0].style.removeProperty('transform')}}
return res}
function apply(root,s,g,live){
var G=g.grid,z=g.z,RA=g.ruleAt,i;
var stats={grid:Math.round(G/z*100)/100,ruleAt:Math.round(RA/z*100)/100,blocks:0,snapped:0,grown:0,offGrid:0,live:!!live};
root.setAttribute(ATTR,String(stats.grid));
var vals={'--orz-rule-at':px(RA/z)};for(i=0;i<g.lined.length;i++)vals[g.lined[i][0]]=px(g.lined[i][1]);
setVars(root,s,vals);
var blocks=[];
for(var c=root.firstElementChild;c;c=c.nextElementSibling){var st=cs(c);
if(st.display==='none'||st.display==='contents'||st.position==='absolute'||st.position==='fixed'||st.float!=='none')continue;
blocks.push(c)}
for(i=0;i<blocks.length;i++)if(isPicture(blocks[i]))addClass(s,blocks[i],PICTURE);
stats.blocks=blocks.length;
var rs=cs(root);
var top0=function(){var r=root.getBoundingClientRect();return r.top+(num(rs.borderTopWidth)+num(rs.paddingTop))*z};
var after=function(y){return RA+Math.ceil((y-RA-EPS)/G)*G};
var meas=live?null:measure(blocks,g,top0);
/* writes in CSS px, in layout units (1/64 px, truncated after the zoom): the rounding is added to what moved,
   so it never accumulates */
var lu=function(n){return Math.trunc(n*z*64)/64};
var wr=function(el,prop,visual,base){var c=q64((base||0)+visual/z);put(s,el,prop,c+'px');return lu(c)-lu(base||0)-visual};
var S=0,prev=null,expect=[];
for(i=0;i<blocks.length;i++){
var el=blocks[i],m=live?measure([el],g,top0)[0]:meas[i],sh=live?0:S,kind=m.kind;
var top=m.top+sh,delta,prevBox=!!prev&&prev.kind==='box';
if(prev&&kind==='box'){
var blank=prev.kind==='text'&&Math.abs(prev.pb-G)<=EPS?G:0;
delta=after(prev.bottom+Math.min(0,prev.mb)-blank+1)+(prevBox?0:G)-top}
else if(prevBox)delta=Math.ceil((prev.bottom-EPS)/G)*G+G-top;
else{var rem=mod(top,G),on=rem<=EPS||G-rem<=EPS;delta=on?0:G-rem}
if(Math.abs(delta)>EPS){
if(prev){
var target=top-prev.bottom+delta,mt=m.mt;
var x=mt>=0?(target>=mt?target:target-mt):(target-mt>=0?target-mt:target);
delta+=wr(prev.el,'margin-bottom',x);stats.snapped++}
else if(delta>0){delta+=wr(el,'margin-top',m.mt+delta);stats.snapped++}
else delta=0}
else delta=0;
sh+=delta;S+=delta;top+=delta;
var bottom=m.bottom+sh,grow=0;
expect.push([el,top]);
if(kind==='math'&&m.baseline!==null&&m.height>0){
var bl=m.baseline+sh,d=mod(g.base-bl,G),shift=d>G/2?d-G:d;
if(m.inkTop+sh+shift<top-EPS)shift+=G;
var low=Math.max(m.inkBottom+sh+shift,bottom-m.pb);
var end=top+Math.max(1,Math.ceil((low-top-EPS)/G))*G;
put(s,el,'position','relative');put(s,el,'top',px(shift/z));
var pbv=Math.max(0,m.pb+end-bottom);
grow=pbv-m.pb+wr(el,'padding-bottom',pbv);stats.snapped++}
else if(kind==='box'){
/* columns side by side end each on a rule; a row below (stacked on a phone) moves down by what the row above grew */
var list=m.cols||[m],hi=-Infinity,newHi=-Infinity,any=false,acc=0,rowEnd=-Infinity,rowNew=-Infinity;
for(var k=0;k<list.length;k++){var q=list[k];if(!(q.height>0))continue;
if(q.top>=rowEnd-EPS){if(rowNew>-Infinity)acc+=rowNew-rowEnd;rowEnd=q.bottom;rowNew=-Infinity}else rowEnd=Math.max(rowEnd,q.bottom);
var qb=q.bottom+sh+acc,add=after(qb)-qb;hi=Math.max(hi,q.bottom+sh);
if(add>EPS){add+=q.byHeight?wr(q.el,'height',add,q.cssH):wr(q.el,'padding-bottom',add,q.cssPb);any=true}
else add=0;
rowNew=Math.max(rowNew,q.bottom+add+acc);newHi=Math.max(newHi,qb+add)}
if(any){grow=newHi-hi;stats.grown++}}
else{
var lines=(m.height+(kind==='lined'?m.mb:0))/G;
if(Math.abs(lines-Math.round(lines))*G>EPS){addClass(s,el,OFF);stats.offGrid++}}
S+=grow;
prev={el:el,kind:kind,bottom:bottom+grow,mb:m.mb,pb:m.pb+(kind==='text'||kind==='lined'?0:grow)}}
s.stats=stats;
if(live)return true;
/* the check: every untransformed block where the arithmetic put it */
var t0=top0();
for(i=0;i<expect.length;i++){var e=expect[i][0],ec=cs(e);if(ec.transform!=='none')continue;
var dy=ec.position==='relative'?num(ec.top)*z:0;
var dev=e.getBoundingClientRect().top-dy-t0-expect[i][1];if(Math.abs(dev)>1){stats.drift=e.tagName+(e.className?'.'+e.className:'')+' #'+i+' '+Math.round(dev*10)/10;return false}}
return true}
function align(root){
if(!root||root.nodeType!==1)return null;
var s=state(root);
reset(root,s);
var g=probe(root);
if(!g){setVars(root,s,{});return null}
if(!apply(root,s,g,false)){var drift=s.stats&&s.stats.drift;reset(root,s);apply(root,s,g,true);if(s.stats)s.stats.drift=drift}
return s.stats}
function schedule(root){
var s=state(root);if(s.raf)return;
var now=Date.now();if(now-s.at>1000){s.at=now;s.runs=0}
if(++s.runs>12){if(!s.late)s.late=W.setTimeout(function(){s.late=0;schedule(root)},1000);return}
var raf=W.requestAnimationFrame||function(f){return W.setTimeout(f,16)};
s.raf=raf(function(){s.raf=0;if(root.isConnected)align(root)})}
function watch(root){
if(!root||root.nodeType!==1)return null;
var s=state(root),r=align(root);
if(!s.ro&&typeof W.ResizeObserver==='function'){s.ro=new W.ResizeObserver(function(){schedule(root)});s.ro.observe(root)}
if(watched.indexOf(root)<0)watched.push(root);
return r}
function release(root){
if(!root||root.nodeType!==1)return;
var s=states.get(root);if(!s)return;
if(s.ro){s.ro.disconnect();s.ro=null}
reset(root,s);setVars(root,s,{});
var i=watched.indexOf(root);if(i>=0)watched.splice(i,1)}
function each(f){watched=watched.filter(function(r){return r.isConnected});for(var i=0;i<watched.length;i++)try{f(watched[i])}catch(e){}}
/* a webfont that arrives changes where baselines fall even when no size changes (whole lines stay whole lines) */
try{if(D.fonts&&typeof D.fonts.addEventListener==='function')D.fonts.addEventListener('loadingdone',function(){each(schedule)})}catch(e){}
W.addEventListener('beforeprint',function(){each(function(r){var s=state(r);reset(r,s);setVars(r,s,{})})});
W.addEventListener('afterprint',function(){each(align)});
W.OrzBaselineGrid=Object.freeze({align:align,watch:watch,release:release,stats:function(root){var s=root&&states.get(root);return s&&s.stats?s.stats:null}});
})();`;
//# sourceMappingURL=baseline-grid.js.map