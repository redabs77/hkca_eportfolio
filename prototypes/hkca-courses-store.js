/* HKCA prototype: shared course registration and examination application store (localStorage).
   The Admin console writes rounds and decisions; the Trainee Dashboard reads rounds,
   applies and withdraws. Both pages use this one store, so a change on one side shows on the other.
   Illustrative only; production reads the database. Demo date is fixed at 24 Oct 2026. */
(function(){
  var KEY='hkca.courses.v1', VER=4, TODAY='2026-10-24';
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MAND=['EASE','EMAC','ADAMA','ECHOA','UGRA'];
  var STAGE_COURSES={BAT:['BSC','IMV','RTB'],HAT:['HTC','CRASH','RTC'],PFY:[]};
  var NAMES={EASE:'Exposure to Anaesthetic Safety & Emergencies',EMAC:'Effective Management of Anaesthetic Crises',ADAMA:'Advanced & Difficult Airway Workshop for Anaesthesiologists',ECHOA:'Focused Transthoracic Echocardiography Workshop for Anaesthetists',UGRA:'Ultrasound-Guided Regional Anaesthesia \u2013 Elementary',ADAMD:'Advanced Difficult Airway Management for Doctors',ASSW:'Advanced Sedation Safety Workshop',BSC:'Basic Sciences Course in Anaesthesiology',IMV:'Intermediate Examination Mock Viva',RTB:'Revision Tutorial Course in Basic Sciences in Anaesthesiology',HTC:'Higher Training Course in Clinical Anaesthesia',CRASH:'Crash Course for Clinical Anaesthesiology',RTC:'Revision Tutorial Course in Clinical Anaesthesiology'};
  var SHORT={EASE:'EASE',EMAC:'EMAC',ECHOA:'ECHO-A',ADAMA:'ADAM-A',UGRA:'UGRA',ADAMD:'ADAM-D',ASSW:'ASSW',BSC:'Basic Sciences Course',IMV:'Intermediate Mock Viva',RTB:'Revision Tutorial (Basic Sciences)',HTC:'Higher Training Course',CRASH:'Crash Course',RTC:'Revision Tutorial (Clinical)'};
  var STAGE_LABEL={BAT:'basic training',HAT:'higher training',PFY:'provisional fellowship'};
  function seedRounds(){return [

      {id:'EASE-0614',course:'EASE',date:'2026-06-14',venue:'',format:'Face-to-face',feeM:0,feeN:0,seats:12,opens:'2026-04-20',closes:'2026-05-31',recorded:'2026-06-15',coord:'',apps:[
        ['HKCA-2024-014','2026-05-02','Accepted'],['HKCA-2024-019','2026-05-03','Accepted'],['HKCA-2023-022','2026-05-05','Accepted'],['HKCA-2024-023','2026-05-20','Waitlisted'],['HKCA-2024-008','2026-05-22','Waitlisted']]},
      {id:'EASE-1114',course:'EASE',date:'2026-11-14',venue:'',format:'Face-to-face',feeM:0,feeN:0,seats:12,opens:'2026-09-01',closes:'2026-10-31',coord:'',apps:[
        ['HKCA-2025-004','2026-09-14','Accepted'],['HKCA-2025-009','2026-09-14','Accepted'],['HKCA-2025-013','2026-09-16','Requested'],['HKCA-2025-021','2026-09-17','Requested'],['HKCA-2024-011','2026-09-20','Requested'],['HKCA-2024-008','2026-09-21','Requested'],['HKCA-2024-023','2026-09-29','Requested'],['HKCA-2024-031','2026-10-02','Rejected']]},
      {id:'ADAM-1128',course:'ADAMA',date:'2026-11-28',venue:'',format:'Face-to-face',feeM:0,feeN:0,seats:6,opens:'2026-09-15',closes:'2026-11-13',coord:'',apps:[
        ['HKCA-2023-022','2026-09-30','Requested'],['HKCA-2022-013','2026-10-01','Requested'],['HKCA-2024-023','2026-10-03','Requested'],['HKCA-2024-019','2026-10-04','Requested'],['HKCA-2022-010','2026-10-04','Requested'],['HKCA-2023-017','2026-10-06','Requested'],['HKCA-2023-009','2026-10-10','Requested'],['HKCA-2024-011','2026-10-12','Requested']]},
      {id:'EMAC-1011',course:'EMAC',date:'2026-10-11',venue:'',format:'Face-to-face',feeM:0,feeN:0,seats:10,opens:'2026-07-20',closes:'2026-09-30',coord:'',apps:[
        ['HKCA-2022-006','2026-08-10','Accepted'],['HKCA-2022-010','2026-08-11','Accepted'],['HKCA-2022-013','2026-08-12','Accepted'],['HKCA-2023-017','2026-08-14','Accepted'],['HKCA-2023-004','2026-08-20','Accepted'],['HKCA-2023-015','2026-08-22','Accepted']]},
      {id:'UGRA-1205',course:'UGRA',date:'2026-12-05',venue:'',format:'Face-to-face',feeM:0,feeN:0,seats:10,opens:'2026-10-12',closes:'2026-11-20',coord:'',apps:[
        ['HKCA-2021-003','2026-10-15','Requested'],['HKCA-2021-009','2026-10-18','Requested'],['HKCA-2022-006','2026-10-20','Requested']]},
      {id:'RTB-1102',course:'RTB',date:'2026-11-02',end:'2026-11-13',venue:'Function Rooms 1\u20133, 2/F, Hotel Stage, Jordon',format:'Face-to-face',feeM:6500,feeN:13000,seats:50,rank:'fcfs',opens:'2026-09-01',closes:'2026-10-20',coord:'Dr FOK King Tak Douglas',apps:[
        ['HKCA-2023-022','2026-09-10','Accepted'],['HKCA-2024-019','2026-09-12','Accepted'],['HKCA-2024-027','2026-09-18','Accepted'],['HKCA-2024-008','2026-10-02','Waitlisted'],['HKCA-2024-023','2026-10-15','Requested']]},
      {id:'IMV-1212',course:'IMV',date:'2026-12-12',venue:'PACU, 4/F, Block D, Queen Elizabeth Hospital',format:'Face-to-face',feeM:1500,feeN:1500,seats:null,opens:'2026-10-01',closes:'2026-11-25',coord:'Dr TAM Suet Yee Zoey, Dr CHAN Kai Wai Kevin, Dr LEE Tien Seng Bryan',apps:[
        ['HKCA-2025-009','2026-10-02','Requested'],['HKCA-2025-004','2026-10-03','Requested'],['HKCA-2024-019','2026-10-06','Requested'],['HKCA-2024-023','2026-10-08','Requested'],['HKCA-2023-022','2026-10-10','Requested'],['HKCA-2024-027','2026-10-12','Requested']]},
      {id:'RTC-1116',course:'RTC',date:'2026-11-16',end:'2026-11-21',venue:'Function Rooms 1\u20132, 2/F, Hotel Stage, Jordon',format:'Face-to-face',feeM:5500,feeN:11000,seats:50,rank:'fcfs',opens:'2026-09-15',closes:'2026-11-02',coord:'Dr FOK King Tak Douglas',apps:[
        ['HKCA-2022-013','2026-10-01','Requested'],['HKCA-2023-017','2026-10-03','Requested'],['HKCA-2022-006','2026-10-05','Requested'],['HKCA-2022-010','2026-10-08','Requested'],['HKCA-2023-004','2026-10-12','Requested']]},
      {id:'BSC-0425',course:'BSC',date:'2027-04-25',end:'2027-07-25',venue:'Seminar Room 113-115, 1/F, School of General Nursing, Queen Elizabeth Hospital',format:'Online and face-to-face',feeM:2000,feeN:4000,seats:null,opens:'2027-03-01',closes:'2027-04-14',coord:'Dr TAM Suet Yee Zoey',apps:[]}
    
  ];}
  function seedDone(){return {'HKCA-2022-019':['EASE','EMAC','ADAMA','ECHOA']};}
  var BASE_ON={'HKCA-2022-019':{EASE:'2024-03-14',EMAC:'2024-09-02',ADAMA:'2025-01-18',ECHOA:'2025-06-07'}};

  /* ---------- examinations: sittings, applications, eligibility ---------- */
  var EX_LONG={Intermediate:'Intermediate Fellowship Examination',Final:'Final Fellowship Examination'};
  var PAY={fps:'118639624',bank:'HSBC 558 069381 001',payee:'The Hong Kong College of Anaesthesiologists',mail:'hkcaexam@hkca.edu.hk'};
  var DECL='I request admission as a candidate for the {EX} and acknowledge the Regulations for Written Examinations and Suspected Misconduct by Examination Candidates.';
  /* One list per exam, so the criteria are easy to change when the College confirms them. */
  var EX_RULES={
    Intermediate:[
      {k:'member',l:'Member and registered trainee of the College',src:'Vocational Training Guide 2.4.1; Intermediate Exam FAQ'},
      {k:'fees',l:'Registration and training fees paid',src:'Intermediate Exam FAQ'},
      {k:'stage',l:'In Basic training',src:'Vocational Training Guide 2.4.3.1'},
      {k:'new',l:'Intermediate not already passed, and no exemption',src:'Added check, not stated in the published rules'}],
    Final:[
      {k:'member',l:'Member and registered trainee of the College',src:'Vocational Training Guide 2.4.1; Final Exam FAQ'},
      {k:'fees',l:'Registration and training fees paid',src:'Final Exam FAQ'},
      {k:'stage',l:'In Higher training',src:'Vocational Training Guide 2.4.4.1'},
      {k:'inter',l:'Intermediate passed, or exemption granted',src:'Vocational Training Guide 2.4.4.1; Final Exam FAQ'},
      {k:'centre',l:'Working in a College-accredited training centre',src:'Vocational Training Guide 2.4.4.1'},
      {k:'new',l:'Final not already passed',src:'Added check, not stated in the published rules'}]
  };
  function exWhy(k,p,exam){
    if(!p)return 'No training record found';
    switch(k){
      case 'member': return p.status==='Deactivated'?'Registration is not active':'';
      case 'fees': return (!p.regFee&&!p.trainFee)?'Registration and training fees are not recorded as paid':!p.regFee?'Registration fee is not recorded as paid':!p.trainFee?'Training fee is not recorded as paid':'';
      case 'stage': return p.stage===(exam==='Final'?'HAT':'BAT')?'':'You are in '+(STAGE_LABEL[p.stage]||p.stage);
      case 'inter': return (p.inter==='Pass'||p.exempt)?'':'Intermediate not yet passed';
      case 'centre': return (p.accred!==false&&p.hosp)?'':'Your hospital is not a College-accredited training centre';
      case 'new':
        if(exam==='Final')return p.final==='Pass'?'Final already passed':'';
        return p.exempt?'Exempt from the Intermediate ('+p.exempt+')':p.inter==='Pass'?'Intermediate already passed':'';
    }
    return '';
  }
  function exElig(id,exam){
    var p=load().prof[id]||null;
    var checks=EX_RULES[exam].map(function(r){var w=exWhy(r.k,p,exam);return {k:r.k,l:r.l,src:r.src,ok:!w,why:w};});
    return {checks:checks,ok:checks.every(function(c){return c.ok;}),fails:checks.filter(function(c){return !c.ok;})};
  }
  function exState(x){
    if(x.written<TODAY)return 'held';
    if(x.shut||x.closes<TODAY)return 'closed';
    if(x.opens>TODAY)return 'scheduled';
    return 'open';
  }
  function exAppOf(x,id){return x.apps.filter(function(a){return a.id===id;})[0]||null;}
  function exAppState(x,a){
    var st=exState(x);
    if(a.wd)return {k:'wd',l:'Withdrawn',c:'mute'};
    if(a.no)return {k:'no',l:'Not admitted',c:'bad'};
    if(a.sotNo)return {k:'sotno',l:'SOT did not endorse',c:'bad'};
    var crit=(a.exc||st==='held')?true:exElig(a.id,x.exam).ok;
    if(a.sot&&a.fee&&crit)return {k:'complete',l:'Complete',c:'ok'};
    if(a.sot&&a.fee)return {k:'crit',l:'Criteria not met',c:'warn'};
    if(st==='closed'||st==='held')return {k:'lapsed',l:'Not completed by the closing date',c:'mute'};
    if(a.sot)return {k:'fee',l:'Awaiting fee',c:'warn'};
    return {k:'sotwait',l:'Waiting for SOT',c:'info'};
  }
  function exEntered(id,exam){
    return load().exams.some(function(x){
      if(x.exam!==exam||exState(x)==='held')return false;
      var a=exAppOf(x,id);return !!(a&&a.sot&&!a.wd&&!a.no&&!a.sotNo);
    });
  }
  function exWeeksBefore(x){var first=x.mcq&&x.mcq<x.written?x.mcq:x.written;return Math.round((d2(first)-d2(x.closes))/864e5);}
  // Carry-forward of section passes (Intermediate FAQ; Final FAQ). Intermediate: one subject (Physiology or Pharmacology).
  // Final: the written section. Up to four subsequent consecutive exams. Counting every sitting the College holds is OUR READING; confirm with the College.
  function exSections(id,exam){
    var p=(load().prof||{})[id],cf=p&&p.cf&&p.cf[exam];
    if(!cf)return {sit:exam==='Intermediate'?['Physiology','Pharmacology']:['Written','Oral','OSCE'],carried:null};
    if(exam==='Intermediate')return {sit:[cf.subject==='Physiology'?'Pharmacology':'Physiology'],carried:{label:cf.subject,from:cf.from,left:cf.left}};
    return {sit:['Oral','OSCE'],carried:{label:'Written',from:cf.from,left:cf.left}};
  }
  function exSecTxt(sec){
    if(!sec||!sec.carried)return 'All sections';
    return sec.sit.length===1?sec.sit[0]+' only':sec.sit.join(' and ')+' only';
  }
  function exCarryTxt(sec){
    if(!sec||!sec.carried)return '';
    var c=sec.carried,n=c.left;
    return c.label+' passed at the '+fmtShort(c.from)+' sitting and carried forward; '+n+(n===1?' sitting':' sittings')+' left. The fee is the same.';
  }
  function fmtShort(d){var m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],a=d.split('-');return +a[2]+' '+m[+a[1]-1]+' '+a[0];}
  function seedExams(){return [
    {id:'INT-2702',exam:'Intermediate',name:'Feb / Apr 2027',opens:'2026-10-05',closes:'2027-01-08',written:'2027-02-19',oral:'2027-04-09',oralEnd:'2027-04-10',fee:8000,apps:[
      {id:'HKCA-2024-019',at:'2026-10-12',sot:{d:'2026-10-14',by:'Supervisor of Training, NDH'},fee:{d:'2026-10-16',how:'Faster Payment System',ref:'FPS 2026101688124'},slip:'FPS_confirmation.pdf'},
      {id:'HKCA-2024-027',at:'2026-10-15',sot:{d:'2026-10-19',by:'Supervisor of Training, UCH'},fee:null,slip:'Payment_slip.jpg'},
      {id:'HKCA-2023-022',at:'2026-10-16',sot:{d:'2026-10-20',by:'Supervisor of Training, PWH'},fee:null,slip:null},
      {id:'HKCA-2024-023',at:'2026-10-17',sot:{d:'2026-10-21',by:'Supervisor of Training, QEH'},fee:{d:'2026-10-22',how:'Bank deposit',ref:'HSBC slip 5580-4471'},slip:null},
      {id:'HKCA-2024-008',at:'2026-10-21',sot:null,fee:null,slip:null},
      {id:'HKCA-2024-014',at:'2026-10-22',sot:null,fee:null,slip:null,sec:{sit:['Pharmacology'],carried:{label:'Physiology',from:'2026-04-18',left:4}}}]},
    {id:'INT-2707',exam:'Intermediate',name:'Jul / Sep 2027',opens:'2027-04-12',closes:'2027-06-10',written:'2027-07-22',oral:'2027-09-10',oralEnd:'2027-09-11',fee:8000,apps:[]},
    {id:'FIN-2703',exam:'Final',name:'Mar / May 2027',opens:'2026-10-12',closes:'2027-02-02',mcq:'2027-03-16',written:'2027-03-23',oral:'2027-05-14',oralEnd:'2027-05-15',osce:'2027-05-16',fee:16000,apps:[
      {id:'HKCA-2022-006',at:'2026-10-14',sot:{d:'2026-10-15',by:'Supervisor of Training, PWH'},fee:{d:'2026-10-19',how:'Faster Payment System',ref:'FPS 2026101990211'},slip:null},
      {id:'HKCA-2022-010',at:'2026-10-16',sot:{d:'2026-10-20',by:'Supervisor of Training, QMH'},fee:null,slip:null,sec:{sit:['Oral','OSCE'],carried:{label:'Written',from:'2026-05-10',left:4}}},
      {id:'HKCA-2022-013',at:'2026-10-13',sot:{d:'2026-10-14',by:'Supervisor of Training, TKOH'},fee:{d:'2026-10-18',how:'E-cheque',ref:'cheque no. 004512'},slip:null},
      {id:'HKCA-2023-015',at:'2026-10-22',sot:null,fee:null,slip:null}]},
    {id:'FIN-2708',exam:'Final',name:'Aug / Oct 2027',opens:'2027-05-03',closes:'2027-07-06',mcq:'2027-08-17',written:'2027-08-24',oral:'2027-10-15',oralEnd:'2027-10-16',osce:'2027-10-17',fee:16000,apps:[]}
  ];}
  function seedProf(){return {'HKCA-2022-019':{stage:'HAT',hosp:'PWH',status:'Active',regFee:true,trainFee:true,inter:'Pass',final:null,exempt:null,accred:true}};}
  function eevent(s,type,id,sid){s.seq=(s.seq||0)+1;s.events=(s.events||[]).concat([{seq:s.seq,type:type,id:id,sid:sid,ex:1,d:TODAY}]).slice(-60);}
  function exFind(s,sid){return s.exams.filter(function(x){return x.id===sid;})[0];}
  function fresh(){return {v:VER,rev:0,seq:0,rounds:seedRounds(),done:seedDone(),exams:seedExams(),prof:seedProf(),events:[]};}
  function put(s){s.rev=(s.rev||0)+1;try{localStorage.setItem(KEY,JSON.stringify(s));}catch(e){}}
  function load(){var s=null;try{s=JSON.parse(localStorage.getItem(KEY));}catch(e){}if(!s||s.v!==VER){s=fresh();put(s);}return s;}
  function d2(i){var p=i.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));}
  function fmt(i){if(!i)return '';var d=d2(i);return d.getUTCDate()+' '+MON[d.getUTCMonth()]+' '+d.getUTCFullYear();}
  function fmtS(i){if(!i)return '';var d=d2(i);return d.getUTCDate()+' '+MON[d.getUTCMonth()];}
  function daysTo(i){return Math.round((d2(i)-d2(TODAY))/864e5);}
  function rEnd(r){return r.end||r.date;}
  function rState(r){
    if(r.recorded)return 'recorded';
    if(rEnd(r)<TODAY)return 'held';
    if(r.shut||(r.closes&&r.closes<TODAY))return 'closed';
    if(r.opens>TODAY)return 'scheduled';
    return 'open';
  }
  function hk(n){return 'HK$'+Number(n).toLocaleString('en-US');}
  function feeText(r){if(r.feeM==null)return 'Fee to be confirmed';if(r.feeM===0&&r.feeN===0)return 'No charge';return hk(r.feeM)+' member fee';}
  function dates(r){return r.end?fmtS(r.date)+' to '+fmt(r.end):fmt(r.date);}
  function appOf(r,id){return r.apps.filter(function(a){return a[0]===id;})[0]||null;}
  function relevant(r,tr){
    if(MAND.indexOf(r.course)>=0)return tr.done.indexOf(r.course)<0?'need':null;
    return (STAGE_COURSES[tr.stage]||[]).indexOf(r.course)>=0?'stage':null;
  }
  function event(s,type,id,rid){s.seq=(s.seq||0)+1;s.events=(s.events||[]).concat([{seq:s.seq,type:type,id:id,round:rid,d:TODAY}]).slice(-60);}
  window.HKC={KEY:KEY,TODAY:TODAY,MAND:MAND,NAMES:NAMES,SHORT:SHORT,STAGE_LABEL:STAGE_LABEL,
    seedRounds:seedRounds,get:load,reset:function(){try{localStorage.removeItem(KEY);}catch(e){}},
    setRounds:function(rounds){var s=load();if(JSON.stringify(s.rounds)===JSON.stringify(rounds))return;s.rounds=rounds;put(s);},
    setDone:function(map){var s=load();if(JSON.stringify(s.done)===JSON.stringify(map))return;s.done=map;put(s);},

    setExams:function(list){var s=load();if(JSON.stringify(s.exams)===JSON.stringify(list))return;s.exams=list;put(s);},
    setProfiles:function(map){var s=load();var m=JSON.parse(JSON.stringify(map));var seed=s.prof||{};Object.keys(seed).forEach(function(k){if(!m[k])m[k]=seed[k];});if(JSON.stringify(s.prof)===JSON.stringify(m))return;s.prof=m;put(s);},
    EX_LONG:EX_LONG,EX_RULES:EX_RULES,PAY:PAY,DECL:DECL,exElig:exElig,exState:exState,exAppOf:exAppOf,exAppState:exAppState,exEntered:exEntered,exWeeksBefore:exWeeksBefore,exSecTxt:exSecTxt,exCarryTxt:exCarryTxt,exSections:exSections,
    exApply:function(id,sid){
      var s=load(),x=exFind(s,sid);
      if(!x)return {ok:false,msg:'That sitting no longer exists.'};
      if(exState(x)!=='open')return {ok:false,msg:'Applications are not open for this sitting.'};
      var el=exElig(id,x.exam);if(!el.ok)return {ok:false,msg:'You do not meet all the criteria yet.'};
      var other=s.exams.filter(function(y){if(y.exam!==x.exam||y.id===x.id)return false;var b=exAppOf(y,id);return b&&!b.wd&&!b.no&&!b.sotNo&&exState(y)!=='held';})[0];
      if(other)return {ok:false,msg:'You already have an application for the '+other.name+' sitting.'};
      var a=exAppOf(x,id);if(a&&!a.wd&&!a.sotNo)return {ok:false,msg:'You have already applied.'};
      var n={id:id,at:TODAY,sot:null,fee:null,slip:null,sec:exSections(id,x.exam)};
      if(a){x.apps[x.apps.indexOf(a)]=n;}else x.apps.push(n);
      eevent(s,'exApply',id,sid);put(s);return {ok:true};
    },
    exWithdraw:function(id,sid){
      var s=load(),x=exFind(s,sid);
      if(!x)return {ok:false,msg:'That sitting no longer exists.'};
      if(exState(x)!=='open')return {ok:false,msg:'Applications have closed. Contact the Board of Examinations to withdraw.'};
      var a=exAppOf(x,id);if(!a||a.wd)return {ok:false,msg:'You have no application to withdraw.'};
      a.wd={d:TODAY,kind:'trainee'};eevent(s,'exWithdraw',id,sid);put(s);return {ok:true};
    },
    exSlip:function(id,sid,name){
      var s=load(),x=exFind(s,sid),a=x&&exAppOf(x,id);if(!a)return {ok:false,msg:'No application found.'};
      a.slip=name;eevent(s,'exSlip',id,sid);put(s);return {ok:true};
    },
    exSot:function(sid,id,yes,why,by){
      var s=load(),x=exFind(s,sid),a=x&&exAppOf(x,id);
      if(!a)return {ok:false,msg:'No application found.'};
      if(exState(x)!=='open')return {ok:false,msg:'The closing date has passed.'};
      if(a.wd)return {ok:false,msg:'The trainee has withdrawn.'};
      if(yes){a.sot={d:TODAY,by:by||'Supervisor of Training'};a.sotNo=null;}else{a.sotNo={d:TODAY,why:why||'',by:by||'Supervisor of Training'};}
      eevent(s,yes?'exSot':'exSotNo',id,sid);put(s);return {ok:true};
    },
    rState:rState,fmt:fmt,fmtS:fmtS,daysTo:daysTo,feeText:feeText,dates:dates,hk:hk,appOf:appOf,relevant:relevant,
    doneList:function(id){return (load().done[id])||[];},
    doneDate:function(id,k){var s=load();var r=s.rounds.filter(function(x){return x.course===k&&(x.attended||[]).indexOf(id)>=0;})[0];return (r&&r.recorded)||((BASE_ON[id]||{})[k])||null;},
    activeFor:function(id,course){return load().rounds.some(function(r){if(r.course!==course)return false;var a=appOf(r,id);var st=rState(r);return st==='open'||(a&&a[2]!=='Withdrawn'&&(st==='closed'||st==='scheduled'));});},
    apply:function(id,rid){
      var s=load(),r=s.rounds.filter(function(x){return x.id===rid;})[0];
      if(!r)return {ok:false,msg:'That round no longer exists.'};
      if(rState(r)!=='open')return {ok:false,msg:'Registration is not open for this round.'};
      var a=appOf(r,id);if(a&&a[2]!=='Withdrawn')return {ok:false,msg:'You have already applied.'};
      if(a){a[1]=TODAY;a[2]='Requested';a.length=3;}else r.apps.push([id,TODAY,'Requested']);
      event(s,'apply',id,rid);put(s);return {ok:true};
    },
    withdraw:function(id,rid){
      var s=load(),r=s.rounds.filter(function(x){return x.id===rid;})[0];
      if(!r)return {ok:false,msg:'That round no longer exists.'};
      if(rState(r)!=='open')return {ok:false,msg:'Registration has closed. Contact College Admin to withdraw.'};
      var a=appOf(r,id);if(!a||a[2]==='Withdrawn')return {ok:false,msg:'You have no application to withdraw.'};
      a[2]='Withdrawn';a[3]={wd:TODAY};event(s,'withdraw',id,rid);put(s);return {ok:true};
    }
  };
})();
