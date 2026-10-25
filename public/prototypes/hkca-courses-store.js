/* HKCA prototype: shared course registration store (localStorage).
   The Admin console writes rounds and decisions; the Trainee Dashboard reads rounds,
   applies and withdraws. Both pages use this one store, so a change on one side shows on the other.
   Illustrative only; production reads the database. Demo date is fixed at 24 Oct 2026. */
(function(){
  var KEY='hkca.courses.v1', VER=2, TODAY='2026-10-24';
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
  function fresh(){return {v:VER,rev:0,seq:0,rounds:seedRounds(),done:seedDone(),events:[]};}
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
