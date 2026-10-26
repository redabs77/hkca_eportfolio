/* HKCA prototype: shared trainer-list store (localStorage).
   The SOT Console edits and confirms a department's trainer list; the Admin console reads the
   confirmation and the reported changes. Illustrative only: names and emails are made up, and
   production reads the database (trainer list = people with the trainer role at a hospital). */
(function(){
  var KEY='hkca.trainers.v1', VER=1;
  var NAMES=['Dr. Chung Wai Lun','Dr. Fan Mei Yee','Dr. Ip Chi Hang','Dr. Kwok Siu Man','Dr. Leung Ka Yan','Dr. Ng Tsz Ho','Dr. Poon Wing Sze','Dr. Sin Hoi Ying','Dr. To Man Kit','Dr. Wan Yuk Ling','Dr. Yip Chun Kit','Dr. Zhou Lai Fong'];
  var UNPL=['Dr. Au Kin Fai','Dr. Cheuk Pui Shan','Dr. Hung Lok Yin','Dr. Mak Sze Wai'];
  var em=function(n){return n.replace(/^Dr\. /,'').toLowerCase().replace(/ /g,'.')+'@example.org'};
  var HOSP=[['HKIC (E)','PYNEH','Pamela Youde Nethersole Eastern Hospital'],['HKIC (E)','RH','Ruttonjee Hospital'],['HKIC (W)','QMH','Queen Mary Hospital'],['HKIC (W)','GH','Grantham Hospital'],['KCC','HKBH','Hong Kong Buddhist Hospital'],['KCC','HKEH','Hong Kong Eye Hospital'],['KCC','KWH','Kwong Wah Hospital'],['KCC','QEH','Queen Elizabeth Hospital'],['KEC','TKOH','Tseung Kwan O Hospital'],['KEC','UCH','United Christian Hospital'],['KWC','CMC','Caritas Medical Centre'],['KWC','NLTH','North Lantau Hospital'],['KWC','PMH','Princess Margaret Hospital'],['KWC','YCH','Yan Chai Hospital'],['NTE','AHNH','Alice Ho Miu Ling Nethersole Hospital'],['NTE','NDH','North District Hospital'],['NTE','PWH','Prince of Wales Hospital'],['NTW','POH','Pok Oi Hospital'],['NTW','TMH','Tuen Mun Hospital'],['NTW','TSWH','Tin Shui Wai Hospital']];
  function seed(){
    var mk=function(n,i){return {id:'T'+i,name:n,email:em(n),st:'on',to:null,isNew:false}};
    return {v:VER,lists:{PWH:NAMES.map(mk)},unplaced:UNPL.map(function(n,i){return {id:'U'+i,name:n,email:em(n)}}),reports:{},lastConf:{PWH:'2026-07-12'},n:100};
  }
  function get(){var s=null;try{s=JSON.parse(localStorage.getItem(KEY))}catch(e){}if(!s||s.v!==VER){s=seed();put(s)}return s}
  function put(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){}}
  function emailTaken(s,e){return Object.keys(s.lists).some(function(h){return s.lists[h].some(function(t){return t.email===e&&t.st==='on'})})}
  var API={KEY:KEY,HOSP:HOSP,get:get,
    list:function(h){return get().lists[h]||[]},
    unplaced:function(){return get().unplaced},
    add:function(h,name,email){var s=get();email=(email||'').trim().toLowerCase();name=(name||'').trim();
      if(!name)return {err:'Enter the trainer\u2019s name.'};
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return {err:'Enter a valid email address.'};
      if(emailTaken(s,email))return {err:'That email is already on a trainer list.'};
      (s.lists[h]=s.lists[h]||[]).push({id:'T'+(s.n++),name:name,email:email,st:'on',to:null,isNew:true});put(s);return {ok:true}},
    claim:function(h,id){var s=get(),i=s.unplaced.findIndex(function(u){return u.id===id});if(i<0)return;var u=s.unplaced.splice(i,1)[0];
      (s.lists[h]=s.lists[h]||[]).push({id:'T'+(s.n++),name:u.name,email:u.email,st:'on',to:null,isNew:true});put(s)},
    setState:function(h,id,st,to){var s=get(),t=(s.lists[h]||[]).find(function(x){return x.id===id});if(!t)return;t.st=st;t.to=st==='moved'?to:null;put(s)},
    changes:function(h){var l=API.list(h);return {joined:l.filter(function(t){return t.isNew&&t.st==='on'}).length,left:l.filter(function(t){return t.st==='left'}).length,moved:l.filter(function(t){return t.st==='moved'}).length}},
    what:function(c){var p=[];if(c.joined)p.push(c.joined+' joined');if(c.left)p.push(c.left+' left');if(c.moved)p.push(c.moved+(c.moved>1?' moved':' moved')+' to another hospital');return p.join(', ')},
    /* Confirm: leavers and movers drop off this list, movers appear on the destination list as new,
       and a report is stored for the Secretariat. */
    confirm:function(h,today,by){var s=get(),c=API.changes(h),l=s.lists[h]||[];
      l.filter(function(t){return t.st==='moved'}).forEach(function(t){var d=(s.lists[t.to]=s.lists[t.to]||[]);if(!d.some(function(x){return x.email===t.email}))d.push({id:'T'+(s.n++),name:t.name,email:t.email,st:'on',to:null,isNew:true})});
      s.lists[h]=l.filter(function(t){return t.st==='on'});s.lists[h].forEach(function(t){t.isNew=false});
      s.lastConf[h]=today;s.reports[h]={on:today,at:Date.now(),by:by,joined:c.joined,left:c.left,moved:c.moved,total:s.lists[h].length,what:API.what(c)};put(s);return s.reports[h]},
    report:function(h){return get().reports[h]||null},
    lastConf:function(h){return get().lastConf[h]||null},
    reset:function(){try{localStorage.removeItem(KEY)}catch(e){}return get()}
  };
  window.TrainersStore=API;
})();
