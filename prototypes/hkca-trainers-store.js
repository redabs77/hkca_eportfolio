/* HKCA prototype: shared trainer-list store (localStorage).
   The SOT Console edits and confirms a department's trainer list; the Admin console reads the
   confirmation and the reported changes. Illustrative only: names and emails are made up, and
   production reads the database (trainer list = people with the trainer role at a hospital). */
(function(){
  var KEY='hkca.trainers.v1', VER=2;
  var NAMES=['Dr. Chung Wai Lun','Dr. Fan Mei Yee','Dr. Ip Chi Hang','Dr. Kwok Siu Man','Dr. Leung Ka Yan','Dr. Ng Tsz Ho','Dr. Poon Wing Sze','Dr. Sin Hoi Ying','Dr. To Man Kit','Dr. Wan Yuk Ling','Dr. Yip Chun Kit','Dr. Zhou Lai Fong'];
  var UNPL=['Dr. Au Kin Fai','Dr. Cheuk Pui Shan','Dr. Hung Lok Yin','Dr. Mak Sze Wai'];
  var em=function(n){return n.replace(/^Dr\. /,'').toLowerCase().replace(/ /g,'.')+'@example.org'};
  var HOSP=[['HKIC (E)','PYNEH','Pamela Youde Nethersole Eastern Hospital'],['HKIC (E)','RH','Ruttonjee Hospital'],['HKIC (W)','QMH','Queen Mary Hospital'],['HKIC (W)','GH','Grantham Hospital'],['KCC','HKBH','Hong Kong Buddhist Hospital'],['KCC','HKEH','Hong Kong Eye Hospital'],['KCC','KWH','Kwong Wah Hospital'],['KCC','QEH','Queen Elizabeth Hospital'],['KEC','TKOH','Tseung Kwan O Hospital'],['KEC','UCH','United Christian Hospital'],['KWC','CMC','Caritas Medical Centre'],['KWC','NLTH','North Lantau Hospital'],['KWC','PMH','Princess Margaret Hospital'],['KWC','YCH','Yan Chai Hospital'],['NTE','AHNH','Alice Ho Miu Ling Nethersole Hospital'],['NTE','NDH','North District Hospital'],['NTE','PWH','Prince of Wales Hospital'],['NTW','POH','Pok Oi Hospital'],['NTW','TMH','Tuen Mun Hospital'],['NTW','TSWH','Tin Shui Wai Hospital']];
  function seed(){
    var YRS=[2004,2011,1999,2016,2008,2013,2002,2018,2006,2010,2014,2001];
    var mk=function(n,i){return {id:'T'+i,name:n,email:em(n),fellow:YRS[i%YRS.length],st:'on',to:null,isNew:false}};
    var hold=[['Dr. Albert Chan','SOT'],['Dr. Winnie Ho','Assistant SOT']].map(function(p,i){return {id:'R'+i,name:p[0],email:em(p[0]),st:'on',to:null,isNew:false,role:p[1]}});
    return {v:VER,lists:{PWH:hold.concat(NAMES.map(mk))},unplaced:UNPL.map(function(n,i){return {id:'U'+i,name:n,email:em(n)}}),reports:{},lastConf:{PWH:'2026-07-12'},n:100};
  }
  function get(){var s=null;try{s=JSON.parse(localStorage.getItem(KEY))}catch(e){}if(!s||s.v!==VER){s=seed();put(s)}s.retired=s.retired||[];return s}
  function put(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){}}
  function emailTaken(s,e){return Object.keys(s.lists).some(function(h){return s.lists[h].some(function(t){return t.email===e&&t.st==='on'})})}
  var API={KEY:KEY,HOSP:HOSP,get:get,
    list:function(h){return get().lists[h]||[]},
    unplaced:function(){return get().unplaced},
    add:function(h,last,first,fellow,email){var s=get();email=(email||'').trim().toLowerCase();last=(last||'').trim();first=(first||'').trim();
      var name='Dr. '+(first+' '+last).trim(),fy=fellow===''||fellow==null?null:+fellow;
      if(!last||!first)return {err:'Enter the last name and the first name.'};
      if(fy!=null&&(!(fy>=1960&&fy<=2026)))return {err:'Fellowship year must be a year from 1960 to 2026, or left blank.'};
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return {err:'Enter a valid email address.'};
      if(emailTaken(s,email))return {err:'That email is already on a trainer list.'};
      (s.lists[h]=s.lists[h]||[]).push({id:'T'+(s.n++),name:name,last:last,first:first,fellow:fy,email:email,st:'on',to:null,isNew:true});put(s);return {ok:true}},
    setFellow:function(h,id,y){var s=get(),t=(s.lists[h]||[]).find(function(x){return x.id===id});if(!t)return {err:1};var v=y===''?null:+y;if(v!=null&&!(v>=1960&&v<=2026))return {err:'Fellowship year must be a year from 1960 to 2026.'};t.fellow=v;put(s);return {ok:true}},
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
    /* Admin's one-off legacy import: people with a hospital go onto that department's list (not yet confirmed
       by its SOT), people without one wait in the unplaced pool, retired staff are kept aside. Matched by email. */
    emails:function(){var s=get(),o={};Object.keys(s.lists).forEach(function(h){s.lists[h].forEach(function(t){o[t.email]=1})});s.unplaced.concat(s.retired).forEach(function(t){o[t.email]=1});return o},
    importMany:function(rows,today){var s=get(),have=API.emails(),n=0;
      rows.forEach(function(r){if(have[r.email])return;have[r.email]=1;n++;
        var base={name:r.name,email:r.email,legacy:true,srcs:r.srcs||[],at:today};
        if(r.retired)s.retired.push(base);
        else if(r.hosp)(s.lists[r.hosp]=s.lists[r.hosp]||[]).push(Object.assign({id:'T'+(s.n++),st:'on',to:null,isNew:false},base));
        else s.unplaced.push(Object.assign({id:'U'+(s.n++)},base))});
      put(s);return n},
    summary:function(){var s=get();return {lists:s.lists,unplaced:s.unplaced,retired:s.retired,lastConf:s.lastConf}},
    /* SOT and Assistant SOT are trainers of their own hospital. The Admin console passes the appointments in post
       (hospital, role, name); each holder is put on that hospital's list with the role, taken off the unplaced pool,
       and the role is cleared again once a term has ended. Idempotent: saves only when something changed. */
    syncAppointments:function(cur){var s=get(),ch=false,want={};
      cur.forEach(function(a){var e=em(a.who);want[a.hosp+'|'+e]=a.role;
        var l=(s.lists[a.hosp]=s.lists[a.hosp]||[]),t=l.find(function(x){return x.email===e});
        var ui=s.unplaced.findIndex(function(x){return x.email===e});if(ui>=0){s.unplaced.splice(ui,1);ch=true}
        if(!t){l.unshift({id:'T'+(s.n++),name:a.who,email:e,st:'on',to:null,isNew:false,role:a.role});ch=true}
        else if(t.role!==a.role||t.st!=='on'){t.role=a.role;t.st='on';t.to=null;ch=true}});
      Object.keys(s.lists).forEach(function(h){s.lists[h].forEach(function(t){if(t.role&&!want[h+'|'+t.email]){delete t.role;ch=true}})});
      if(ch)put(s)},
    report:function(h){return get().reports[h]||null},
    lastConf:function(h){return get().lastConf[h]||null},
    reset:function(){try{localStorage.removeItem(KEY)}catch(e){}return get()}
  };
  window.TrainersStore=API;
})();
