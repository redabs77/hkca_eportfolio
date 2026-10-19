/* HKCA prototype: shared learning-plans store (localStorage).
   Two plan types share one workflow: SIX_MONTH (6-month learning goals) and PF_YEAR (Provisional Fellow year plan).
   Lets the Trainee Dashboard and SOT Console show the same data when opened from the same site.
   Illustrative only; not production code. */
(function(){
  var KEY = 'hkca.plans.v3', TODAY = '2026-10-17', DEMO_DAY = '2026-12-03';
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function pad(n){ return (n<10?'0':'')+n; }
  function d2(iso){ var p = iso.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function iso(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function addDays(s,n){ var d = d2(s); d.setDate(d.getDate()+n); return iso(d); }
  function fmt(s){ if(!s) return ''; var p = s.split('-'); return (+p[2]) + ' ' + MON[+p[1]-1]; }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  var TYPES = {
    SIX_MONTH:{label:'6-month goals', title:'6-month learning goals', min:2, max:5},
    PF_YEAR:{label:'PF year plan', title:'Provisional Fellow year plan', min:3, max:9}
  };
  var PER = {
    SIX_MONTH:{start:'2026-07-01', end:'2026-12-31', label:'Jul \u2013 Dec 2026'},
    PF_YEAR:{start:'2026-01-01', end:'2026-12-31', label:'Jan \u2013 Dec 2026'}
  };
  var PF_DOMAINS = [
    {c:'CLINICAL',   label:'Clinical',   hint:'e.g. lead complex lists with remote supervision'},
    {c:'MANAGEMENT', label:'Management', hint:'e.g. contribute to rostering, audit or service improvement'},
    {c:'EDUCATION',  label:'Education',  hint:'e.g. teach, supervise or assess junior trainees'}
  ];
  /* curriculum domains from the HKCA Curriculum Competency Mapping Table; ITA competencies are a shortlist of the 15-item College form */
  var GROUPS = [
    {g:'Clinical fundamentals', items:[['CF-2.1','General anaesthesia and sedation'],['CF-2.2','Regional anaesthesia'],['CF-2.3','Airway management'],['CF-2.4','Acute pain management'],['CF-2.5','Perioperative medicine'],['CF-2.6','Trauma, crisis management and resuscitation'],['CF-2.7','Safety and quality in anaesthesia']]},
    {g:'Subspecialty', items:[['SM-3.1','General surgery, urology, gynaecology, endoscopy'],['SM-3.2','Head and neck / ENT'],['SM-3.3','Orthopaedic surgery'],['SM-3.4','Paediatric anaesthesia'],['SM-3.5','Obstetric anaesthesia and analgesia'],['SM-3.6','Neuroanaesthesia'],['SM-3.7','Ophthalmic anaesthesia'],['SM-3.8','Anaesthesia outside the operating theatre'],['SM-3.9','Cardiac surgery and interventional cardiology'],['SM-3.10','Thoracic surgery'],['SM-3.11','Vascular surgery'],['SM-3.12','Pain medicine'],['SM-3.13','Intensive care medicine']]},
    {g:'ITA competencies', items:[['ITA-CLINICAL_SKILLS','Clinical skills'],['ITA-CRISIS_MANAGEMENT','Crisis management'],['ITA-TEAMWORK','Teamwork'],['ITA-COMMUNICATION','Communication']]},
    {g:'Other', items:[['OTHER','Other (explain in the goal)']]}
  ];
  var DOM = {}; GROUPS.forEach(function(g){ g.items.forEach(function(i){ DOM[i[0]] = {label:i[1], group:g.g}; }); });
  PF_DOMAINS.forEach(function(p){ DOM[p.c] = {label:p.label, group:'PF domain'}; });
  function domLabel(c){ return DOM[c] ? DOM[c].label : ''; }
  function domCode(c){ return /^(CF|SM)-/.test(c||'') ? c : ''; }
  function domainSelect(sel, onchange, suggest, ariaLabel){
    suggest = suggest || [];
    var o = function(c,l){ return '<option value="'+c+'"'+(c===sel?' selected':'')+'>'+esc((domCode(c)?c+' \u00b7 ':'')+l)+'</option>'; };
    var h = '<select aria-label="'+esc(ariaLabel||'Domain')+'" onchange="'+onchange+'"><option value=""'+(sel?'':' selected')+' disabled>Choose a domain</option>';
    if(suggest.length) h += '<optgroup label="Suggested for your rotation">'+suggest.map(function(c){ return o(c, domLabel(c)); }).join('')+'</optgroup>';
    GROUPS.forEach(function(g){
      var its = g.items.filter(function(i){ return suggest.indexOf(i[0])<0; });
      if(its.length) h += '<optgroup label="'+esc(g.g)+'">'+its.map(function(i){ return o(i[0], i[1]); }).join('')+'</optgroup>';
    });
    return h + '</select>';
  }

  var LABEL = {NOT_SET:'Not set', DRAFT:'Draft', SUBMITTED:'Awaiting sign-off', CHANGES_REQUESTED:'Changes requested',
    AWAITING_COS:'With Chief of Service', CHANGE_COS:'Change with Chief of Service', SIGNED:'Signed \u00b7 locked', CHANGE_PROPOSED:'Change proposed',
    REVIEW_OPEN:'Review open', REVIEW_SUBMITTED:'Review submitted', REVIEWED:'Reviewed'};
  var TONE = {NOT_SET:'bad', DRAFT:'', SUBMITTED:'warn', CHANGES_REQUESTED:'warn', AWAITING_COS:'info', CHANGE_COS:'info', SIGNED:'ok',
    CHANGE_PROPOSED:'info', REVIEW_OPEN:'info', REVIEW_SUBMITTED:'warn', REVIEWED:'ok'};
  function label(type, st){ return (type==='PF_YEAR' && st==='SIGNED') ? 'Approved \u00b7 locked' : LABEL[st]; }

  function G(domain,text,success,evidence){ return {id:'g'+Math.random().toString(36).slice(2,8), domain:domain, text:text, success:success, evidence:evidence}; }
  var T6 = {
    BAT:[G('CF-2.1','Run an ASA I\u2013II list with indirect supervision','Complete 10 consecutive lists with no supervisor intervention','Logbook + 2 DOPS'),
         G('CF-2.2','Become confident with neuraxial techniques','25 spinals and 10 epidurals, success rate above 90%','VOP 2.2 + mini-CEX'),
         G('ITA-CRISIS_MANAGEMENT','Manage common emergencies safely','Lead the response in 3 simulated or real crises','Simulation record + CBD')],
    HAT:[G('ITA-TEAMWORK','Supervise junior trainees on a list','Supervise 10 lists; positive feedback from 2 juniors','Teaching log + feedback'),
         G('SM-3.9','Build subspecialty depth','Complete the specialty module cases for this rotation','VOP specialty + WBA'),
         G('OTHER','Progress the formal project','Protocol approved by the end of the period','Project tracker')],
    PFY:[G('ITA-CLINICAL_SKILLS','Prepare for independent practice','Run a full list with consultant remote only, 8 times','Logbook + supervisor report'),
         G('OTHER','Complete the formal project','Manuscript submitted','Project tracker'),
         G('CF-2.7','Contribute to departmental quality work','Present one audit at the M&M meeting','Meeting minutes')]
  };
  var TPF = [G('CLINICAL','Lead complex cardiac lists with remote supervision','Run 20 lists with the consultant remote only','Logbook + supervisor report'),
             G('MANAGEMENT','Take part in rostering and list planning','Draft the theatre roster for 2 months with the roster lead','Roster record + lead feedback'),
             G('EDUCATION','Teach and assess junior trainees','Run a monthly teaching session; assess 4 trainees (mini-CEX)','Teaching log + assessments')];
  function copy(list){ return list.map(function(g){ return Object.assign({}, g, {id:'g'+Math.random().toString(36).slice(2,8)}); }); }
  function mk(type, stage){ return type==='PF_YEAR' ? copy(TPF) : copy(T6[String(stage).split('-')[0]]); }
  function R(){ return {reflections:{}, summary:'', submittedAt:null, reviewedAt:null, reviewedBy:null, comment:''}; }
  function P(type, status, stage, x){
    var p = {type:type, status:status, period:Object.assign({}, PER[type]), goals: status==='NOT_SET' ? [] : mk(type, stage),
      version: (status==='SIGNED'||status==='CHANGE_PROPOSED'||status==='AWAITING_COS') ? 1 : 0,
      notifiedAt:PER[type].start, submittedAt:null, signedBy:null, signedAt:null, cosBy:null, cosAt:null, boardInformedAt:null,
      comments:[], proposal:null, versions:[], review:R()};
    return Object.assign(p, x||{});
  }
  function blank(type){ return P(type||'SIX_MONTH', 'NOT_SET', 'HAT'); }
  var SIGNER = {'2024-011':'Dr. Albert Chan','2024-008':'Dr. Albert Chan','2021-015':'Dr. Albert Chan','2022-019':'Dr. Albert Chan',
    '2021-004':'Dr. Winnie Ho','2023-018':'Dr. Raymond Ng','2022-031':'Dr. Tina Leung'};
  function sgn(id, at, sub){ return {signedBy:SIGNER[id]||'Dr. Albert Chan', signedAt:at||'2026-07-16', submittedAt:sub||'2026-07-10'}; }
  function withReview(p, texts, x){
    p.goals.forEach(function(g,i){ if(texts[i]) p.review.reflections[g.id] = texts[i]; });
    Object.assign(p.review, x||{}); return p;
  }
  function seed(){
    var six = {
      '2022-019': P('SIX_MONTH','NOT_SET','HAT-2',{notifiedAt:'2026-10-12'}),
      '2024-011': withReview(P('SIX_MONTH','SIGNED','HAT-1',sgn('2024-011')), ['Ran 11 supervised lists; two juniors gave written feedback.','Completed 6 of 8 module cases.','Protocol approved by the committee in November.'], {submittedAt:'2026-12-05'}),
      '2024-008': P('SIX_MONTH','SIGNED','BAT-2',sgn('2024-008')),
      '2021-004': P('SIX_MONTH','SIGNED','PFY',sgn('2021-004')),
      '2023-018': withReview(P('SIX_MONTH','SIGNED','HAT-1',sgn('2023-018')), ['Supervised 10 lists.','Module cases complete.','Protocol approved in September.'], {submittedAt:'2026-12-02', reviewedAt:'2026-12-06', reviewedBy:'Dr. Raymond Ng', comment:'Good progress on all three. Carry the project into the next period.'}),
      '2021-015': P('SIX_MONTH','SIGNED','PFY',sgn('2021-015')),
      '2023-015': P('SIX_MONTH','SUBMITTED','HAT-2',{submittedAt:'2026-10-06'}),
      '2023-022': P('SIX_MONTH','SUBMITTED','BAT-3',{submittedAt:'2026-10-08'}),
      '2024-019': P('SIX_MONTH','SUBMITTED','BAT-2',{submittedAt:'2026-10-10'}),
      '2024-025': P('SIX_MONTH','SUBMITTED','BAT-2',{submittedAt:'2026-10-12'}),
      '2025-003': P('SIX_MONTH','CHANGES_REQUESTED','BAT-1',{submittedAt:'2026-10-02', notifiedAt:'2026-09-28',
         comments:[{by:'Dr. Raymond Ng',at:'2026-10-05',text:'Goal 2 is not measurable yet. Add a number or a named assessment.'}]}),
      '2025-012': P('SIX_MONTH','DRAFT','BAT-1',{notifiedAt:'2026-10-05'}),
      '2024-033': P('SIX_MONTH','NOT_SET','HAT-1',{notifiedAt:'2026-10-01'}),
      '2023-009': P('SIX_MONTH','NOT_SET','HAT-1',{notifiedAt:'2026-10-03'}),
      '2022-031': P('SIX_MONTH','CHANGE_PROPOSED','HAT-2',sgn('2022-031'))
    };
    var ts = six['2022-031'];
    ts.proposal = {at:'2026-10-14', reason:'Moved to the cardiac subspecialty list in October; goal 2 no longer fits.',
      goals: ts.goals.map(function(g,i){ return i===1 ? Object.assign({},g,{domain:'SM-3.9',text:'Advance TOE competence on cardiac lists',success:'Log 30 TOE studies; pass a TOE DOPS',evidence:'Echo log + DOPS'}) : g; })};
    var plans = {};
    Object.keys(six).forEach(function(id){ plans[id+'|SIX_MONTH'] = six[id]; });
    plans['2021-004|PF_YEAR'] = P('PF_YEAR','AWAITING_COS','PFY',{submittedAt:'2026-10-10', signedBy:'Dr. Winnie Ho', signedAt:'2026-10-14'});
    plans['2021-015|PF_YEAR'] = P('PF_YEAR','SIGNED','PFY',{submittedAt:'2026-01-12', signedBy:'Dr. Albert Chan', signedAt:'2026-01-16', cosBy:'Dr. Albert Chan', cosAt:'2026-01-20'});
    return {v:3, demoReview:false, plans:plans};
  }
  function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  function load(){
    try{ var s = JSON.parse(localStorage.getItem(KEY)); if(s && s.v===3) return s; }catch(e){}
    var n = seed(); save(n); return n;
  }
  function key(id,type){ return id+'|'+(type||'SIX_MONTH'); }
  function get(id,type){ return load().plans[key(id,type)] || null; }
  function update(id,type,fn){ var s = load(), k = key(id,type); if(!s.plans[k]) s.plans[k] = blank(type); fn(s.plans[k]); save(s); return s.plans[k]; }
  function reset(){ var cur = load(), n = seed(); n.demoReview = cur.demoReview; save(n); return n; }
  function now(){ return load().demoReview ? DEMO_DAY : TODAY; }
  function setDemoReview(on){ var s = load(); s.demoReview = !!on; save(s); }
  function demoReview(){ return !!load().demoReview; }
  function reviewOpens(p, lead){ return addDays(p.period.end, -(lead||28)); }
  function reviewOpen(p, lead){ return now() >= reviewOpens(p, lead); }
  /* effective status: adds the end-of-period review states on top of the stored status */
  function eff(p, lead){
    if(!p) return 'NOT_SET';
    if(p.status!=='SIGNED' || !reviewOpen(p, lead)) return p.status;
    if(p.review && p.review.reviewedAt) return 'REVIEWED';
    if(p.review && p.review.submittedAt) return 'REVIEW_SUBMITTED';
    return 'REVIEW_OPEN';
  }
  function check(type, goals){
    var full = function(g){ return g.text.trim() && g.success.trim() && g.domain; };
    if(type==='PF_YEAR'){
      for(var i=0;i<PF_DOMAINS.length;i++){
        var inD = goals.filter(function(g){ return g.domain===PF_DOMAINS[i].c; });
        if(!inD.length) return 'Add at least one goal under '+PF_DOMAINS[i].label+'.';
      }
      if(goals.some(function(g){ return !full(g); })) return 'Each goal needs a description and what success looks like.';
      return '';
    }
    if(goals.length<2 || goals.length>5) return 'Use 2 to 5 goals.';
    if(goals.some(function(g){ return !full(g); })) return 'Each goal needs a domain, a description and what success looks like.';
    return '';
  }
  window.PlansStore = {KEY:KEY, TODAY:TODAY, DEMO_DAY:DEMO_DAY, TYPES:TYPES, PER:PER, PF_DOMAINS:PF_DOMAINS, GROUPS:GROUPS, LABEL:LABEL, TONE:TONE,
    label:label, domLabel:domLabel, domCode:domCode, domainSelect:domainSelect, fmt:fmt, esc:esc, addDays:addDays, d2:d2,
    load:load, save:save, get:get, update:update, reset:reset, now:now, setDemoReview:setDemoReview, demoReview:demoReview,
    reviewOpens:reviewOpens, reviewOpen:reviewOpen, eff:eff, check:check, blank:blank,
    newGoal:function(domain){ return G(domain||'','','',''); }};
})();
