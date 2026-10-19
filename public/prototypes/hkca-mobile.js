/* HKCA ePortfolio: mobile helpers. Harmless on desktop (CSS only reacts <= 720px).
   1. Tables get data-labels + card classes so rows can render as cards on phones.
   2. A "Sort by" control replaces the hidden header row on sortable tables.
   3. The tab bar scrolls the active tab into view and shows a fade while more tabs lie to the right. */
(function(){
  var SKIP = '.vop-tbl,.vop-hm';
  function hdrLabels(t){
    var row = t.tHead && t.tHead.rows[0]; if(!row) return null;
    return Array.prototype.map.call(row.cells, function(th){
      var c = th.cloneNode(true);
      c.querySelectorAll('.arr').forEach(function(x){ x.remove(); });
      return c.textContent.replace(/[\u2191\u2193\u2195\u25B2\u25BC\u21C5]/g,'').replace(/\s+/g,' ').trim();
    });
  }
  function decorate(t){
    var L = hdrLabels(t); if(!L) return;
    t.classList.add('mcard');
    var w = t.closest('.tbl-scroll'); if(w) w.classList.add('m-cardwrap');
    Array.prototype.forEach.call(t.tBodies, function(tb){
      Array.prototype.forEach.call(tb.rows, function(tr){
        var cells = Array.prototype.slice.call(tr.cells);
        if(cells.length===1 || cells.some(function(c){ return c.colSpan>1; })){
          if(!tr.classList.contains('empty-row')) tr.classList.add('m-grp');
          return;
        }
        var titled = false;
        cells.forEach(function(td,i){
          var lab = L[i]||'', txt = td.textContent.trim();
          var isSel = !!td.querySelector('input[type=checkbox]') && !txt;
          var isAct = !isSel && (/^(actions?)?$/i.test(lab)) && !!td.querySelector('button,a');
          if(lab && !isSel && !isAct) td.setAttribute('data-label', lab);
          if(isSel){ td.classList.add('m-sel'); return; }
          if(isAct){ td.classList.add('m-act'); return; }
          if(!titled){ td.classList.add('m-title'); titled = true; return; }
          if(txt.length>24 || lab.length>14 || td.querySelector('.segbar,table,select,textarea,.bar,progress')) td.classList.add('m-wide');
        });
      });
    });
    sortControl(t, L);
  }
  function sortControl(t, L){
    var w = t.closest('.tbl-scroll') || t;
    var ths = Array.prototype.slice.call(t.tHead.rows[0].cells);
    var btns = ths.map(function(th){ return th.querySelector('button[onclick]'); });
    if(!btns.some(Boolean)) return;
    var sig = ths.map(function(th,i){ return L[i]+':'+(th.getAttribute('aria-sort')||''); }).join('|');
    var bar = w.previousElementSibling;
    if(!bar || !bar.classList || !bar.classList.contains('m-sort')){
      bar = document.createElement('div'); bar.className = 'm-sort';
      bar.innerHTML = '<label>Sort</label><select class="ctl" aria-label="Sort by"></select><button type="button" aria-label="Reverse order">\u21C5</button>';
      w.parentNode.insertBefore(bar, w);
      bar.querySelector('select').addEventListener('change', function(e){
        var b = currentBtns(bar); var i = +e.target.value; if(b[i]) b[i].click();
      });
      bar.querySelector('button').addEventListener('click', function(){
        var b = currentBtns(bar), s = bar.querySelector('select'); if(b[+s.value]) b[+s.value].click();
      });
      bar._tbl = t;
    }
    bar._tbl = t;
    if(bar.getAttribute('data-sig')===sig) return;
    bar.setAttribute('data-sig', sig);
    var sel = bar.querySelector('select'), cur = 0;
    sel.innerHTML = ths.map(function(th,i){
      if(!btns[i]) return '';
      var on = th.getAttribute('aria-sort') && th.getAttribute('aria-sort')!=='none';
      if(on) cur = i;
      return '<option value="'+i+'">'+L[i].replace(/</g,'&lt;')+'</option>';
    }).join('');
    sel.value = String(cur);
  }
  function currentBtns(bar){
    var t = bar._tbl; if(!t || !t.isConnected) return [];
    return Array.prototype.map.call(t.tHead.rows[0].cells, function(th){ return th.querySelector('button[onclick]'); });
  }
  var queued = false;
  function scan(){
    queued = false;
    document.querySelectorAll('.tbl-scroll table, table.hm-tbl').forEach(function(t){
      if(t.matches(SKIP)) return; decorate(t);
    });
  }
  function queue(){ if(!queued){ queued = true; requestAnimationFrame(scan); } }
  function init(){
    scan();
    /* first visit on a phone: the roster starts on the Essential column set (cards stay short) */
    try{
      if(matchMedia('(max-width:720px)').matches && typeof setColPreset==='function' && !localStorage.getItem('sot-roster-view-v2')) setColPreset('essential');
    }catch(e){}
    scan();
    new MutationObserver(queue).observe(document.body, {childList:true, subtree:true});
    document.querySelectorAll('.tabs, .rail-row').forEach(function(tabs){
      var upd = function(){ tabs.classList.toggle('at-end', tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 6); };
      tabs.addEventListener('scroll', upd, {passive:true}); window.addEventListener('resize', upd); upd();
      new MutationObserver(function(){
        var a = tabs.querySelector('.tab.on, .step.on');
        if(a && a.scrollIntoView) a.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'});
      }).observe(tabs, {subtree:true, attributes:true, attributeFilter:['class']});
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
