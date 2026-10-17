/* HKCA prototype: shared learning-goals store (localStorage). Lets the Trainee Dashboard, SOT Console,
   ITA Trainer Form and ITA Synthesis Flow show the same data when opened from the same site.
   Illustrative only; not production code. */
(function(){
  var KEY = 'hkca.goals.v1', CYCLE = 'Jul \u2013 Dec 2026';
  var LABEL = {NOT_SET:'Not set', DRAFT:'Draft', SUBMITTED:'Awaiting sign-off', CHANGES_REQUESTED:'Changes requested',
               SIGNED:'Signed \u00b7 locked', CHANGE_PROPOSED:'Change proposed'};
  var TONE  = {NOT_SET:'bad', DRAFT:'', SUBMITTED:'warn', CHANGES_REQUESTED:'warn', SIGNED:'ok', CHANGE_PROPOSED:'info'};
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmt(iso){ if(!iso) return ''; var p = iso.split('-'); return (+p[2]) + ' ' + MON[+p[1]-1]; }
  function G(text,success,evidence){ return {id:'g'+Math.random().toString(36).slice(2,8), text:text, success:success, evidence:evidence}; }
  var T = {
    BAT:[G('Run an ASA I\u2013II list with indirect supervision','Complete 10 consecutive lists with no supervisor intervention','Logbook + 2 DOPS'),
         G('Become confident with neuraxial techniques','25 spinals and 10 epidurals, success rate above 90%','VOP 2.2 + mini-CEX'),
         G('Manage common emergencies safely','Lead the response in 3 simulated or real crises','Simulation record + CBD')],
    HAT:[G('Supervise junior trainees on a list','Supervise 10 lists; positive feedback from 2 juniors','Teaching log + feedback'),
         G('Build subspecialty depth','Complete the specialty module cases for this rotation','VOP specialty + WBA'),
         G('Progress the formal project','Protocol approved by the end of the cycle','Project tracker')],
    PFY:[G('Prepare for independent practice','Run a full list with consultant remote only, 8 times','Logbook + supervisor report'),
         G('Complete the formal project','Manuscript submitted','Project tracker'),
         G('Contribute to departmental quality work','Present one audit at the M&M meeting','Meeting minutes')]
  };
  function mk(stage){ return T[stage.split('-')[0]].map(function(g){ return Object.assign({}, g, {id:'g'+Math.random().toString(36).slice(2,8)}); }); }
  function S(status,stage,x){
    var s = {status:status, goals: status==='NOT_SET' ? [] : mk(stage), version: status==='SIGNED'||status==='CHANGE_PROPOSED' ? 1 : 0,
      submittedAt:null, signedBy:null, signedAt:null, notifiedAt:'2026-07-01', comments:[], proposal:null, outcomes:{}, reflections:{}, versions:[]};
    return Object.assign(s, x||{});
  }
  var SIGN = {signedBy:'Dr. Albert Chan', signedAt:'2026-07-16', submittedAt:'2026-07-10'};
  function seed(){
    var sets = {
      '2022-019': S('NOT_SET','HAT-2',{notifiedAt:'2026-10-12'}),
      '2024-011': S('SIGNED','HAT-1',SIGN), '2024-008': S('SIGNED','BAT-2',SIGN), '2021-004': S('SIGNED','PFY',SIGN),
      '2023-018': S('SIGNED','HAT-1',SIGN), '2021-015': S('SIGNED','PFY',SIGN),
      '2023-015': S('SUBMITTED','HAT-2',{submittedAt:'2026-10-06'}),
      '2023-022': S('SUBMITTED','BAT-3',{submittedAt:'2026-10-08'}),
      '2024-019': S('SUBMITTED','BAT-2',{submittedAt:'2026-10-10'}),
      '2024-025': S('SUBMITTED','BAT-2',{submittedAt:'2026-10-12'}),
      '2025-003': S('CHANGES_REQUESTED','BAT-1',{submittedAt:'2026-10-02',notifiedAt:'2026-09-28',
         comments:[{by:'Dr. Albert Chan',at:'2026-10-05',text:'Goal 2 is not measurable yet. Add a number or a named assessment.'}]}),
      '2025-012': S('DRAFT','BAT-1',{notifiedAt:'2026-10-05'}),
      '2024-033': S('NOT_SET','HAT-1',{notifiedAt:'2026-10-01'}),
      '2023-009': S('NOT_SET','HAT-1',{notifiedAt:'2026-10-03'}),
      '2022-031': S('CHANGE_PROPOSED','HAT-2',Object.assign({},SIGN,{proposal:null}))
    };
    var ts = sets['2022-031'];
    ts.proposal = {at:'2026-10-14', reason:'Moved to the cardiac subspecialty list in October; goal 2 no longer fits.',
      goals: ts.goals.map(function(g,i){ return i===1 ? Object.assign({},g,{text:'Advance TOE competence on cardiac lists',success:'Log 30 TOE studies; pass a TOE DOPS',evidence:'Echo log + DOPS'}) : g; })};
    return {v:1, cycle:CYCLE, sets:sets};
  }
  function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  function load(){
    try{ var s = JSON.parse(localStorage.getItem(KEY)); if(s && s.v===1) return s; }catch(e){}
    var n = seed(); save(n); return n;
  }
  function get(id){ return load().sets[id] || null; }
  function update(id, fn){ var s = load(); if(!s.sets[id]) s.sets[id] = S('NOT_SET','HAT-1'); fn(s.sets[id]); save(s); return s.sets[id]; }
  function reset(){ var n = seed(); save(n); return n; }
  function demoSign(id, stage){
    return update(id, function(x){ x.goals = mk(stage||'HAT-2'); x.status='SIGNED'; x.version=1; x.signedBy='Dr. Albert Chan';
      x.signedAt='2026-10-17'; x.submittedAt='2026-10-16'; });
  }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  window.GoalsStore = {KEY:KEY, CYCLE:CYCLE, LABEL:LABEL, TONE:TONE, fmt:fmt, load:load, save:save, get:get, update:update, reset:reset, demoSign:demoSign, esc:esc, newGoal:function(){ return G('','',''); }};
})();
