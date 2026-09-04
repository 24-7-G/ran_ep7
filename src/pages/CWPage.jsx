import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { PRIMARY_TIMEZONE, GUILD_CLASSES } from "../lib/constants";
import { useGlobalDisplayTimezone } from "../lib/displayTimezone";
import { zonedDateToUtc } from "../lib/time";
import swordmanIcon from "../icons/swordman.svg";
import archerIcon from "../icons/archer.svg";
import gunnerIcon from "../icons/gunner.svg";
import shamanIcon from "../icons/shaman.svg";
import extremeIcon from "../icons/extreme.svg";
import brawlerIcon from "../icons/brawler.svg";
import cwWarIcon from "../icons/cw-war.svg";
import guildWarArtwork from "../bosses/guild-war.png";
import "./CWPage.css";

const CW_DAYS = [
  { key: 1, label: "MONDAY" },
  { key: 3, label: "WEDNESDAY" },
  { key: 5, label: "FRIDAY" },
  { key: 6, label: "SATURDAY" },
];
const DEFAULT_ROLES = ["Hitter", "Taichi Stream", "Full Support", "Setter"];
const PAGE_SIZE = 10;
const CLASS_ICONS = {
  Swordman: "⚔", Archer: "🏹", Gunner: "▰", Shaman: "✦", Extreme: "✹", Brawler: "✊",
};

function clean(v) { return v == null ? "" : String(v).trim(); }
function num(v, fallback = 0) {
  const cleaned = typeof v === "string" ? v.replace(/,/g, "").trim() : v;
  if (cleaned === "" || cleaned == null) return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}
function formatMoneyInput(v) {
  if (v == null || v === "") return "";
  let raw = String(v).replace(/,/g, "").replace(/[^0-9.]/g, "");
  const dot = raw.indexOf(".");
  if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, "");
  if (!raw) return "";
  const [whole, decimal] = raw.split(".");
  const wholeFormatted = whole ? Number(whole).toLocaleString("en-US") : "0";
  return dot === -1 ? wholeFormatted : `${wholeFormatted}.${decimal ?? ""}`;
}
function safeDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v?.seconds != null) return new Date(Number(v.seconds) * 1000);
  const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d;
}
function partsInZone(date, timezone) {
  const d = safeDate(date); if (!d) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || PRIMARY_TIMEZONE, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" }).formatToParts(d);
    return Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  } catch { return null; }
}
function dateKey(date, timezone) { const p = partsInZone(date, timezone); return p ? `${p.year}-${p.month}-${p.day}` : ""; }
function formatDate(date, timezone) { const d=safeDate(date); if(!d)return "—"; try{return new Intl.DateTimeFormat("en-US",{timeZone:timezone,month:"short",day:"numeric",year:"numeric"}).format(d)}catch{return d.toLocaleDateString()} }
function formatDateTime(date, timezone) { const d=safeDate(date); if(!d)return "—"; try{return new Intl.DateTimeFormat("en-US",{timeZone:timezone,month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",hourCycle:"h12",timeZoneName:"short"}).format(d)}catch{return d.toLocaleString()} }
function dateTimeInputValue(date, timezone) { const p=partsInZone(date, timezone); return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : ""; }
function zonedDateTimeInputToUtc(value, timezone) { const m=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); if(!m)return null; return zonedDateToUtc(`${m[1]}-${m[2]}-${m[3]}`,Number(m[4]),Number(m[5]),timezone||PRIMARY_TIMEZONE); }
function formatTime(date, timezone) { const d=safeDate(date); if(!d)return "—"; try{return new Intl.DateTimeFormat("en-US",{timeZone:timezone,hour:"numeric",minute:"2-digit",hourCycle:"h12",timeZoneName:"short"}).format(d)}catch{return d.toLocaleTimeString()} }
function countdownLabel(at, now) { const ms=(safeDate(at)?.getTime()||0)-now.getTime(); if(ms>0)return `STARTS IN ${diffText(ms)}`; if(ms>-2*60*60*1000)return "CW IN PROGRESS"; return "VIEW CW ROSTER →"; }
function money(v) { return num(v).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2}); }
function count(v) { return num(v).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2}); }
function actor(user) { return clean(user?.email)||clean(user?.displayName)||"System"; }
function diffText(ms) {
  const sec=Math.max(0,Math.floor(ms/1000)); const d=Math.floor(sec/86400); const h=Math.floor(sec%86400/3600); const m=Math.floor(sec%3600/60); const s=sec%60;
  if(d) return `${d}d ${h}h ${m}m`;
  if(h) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
const CLASS_ICON_PATHS={Swordman:swordmanIcon,Archer:archerIcon,Gunner:gunnerIcon,Shaman:shamanIcon,Extreme:extremeIcon,Brawler:brawlerIcon};
function classIcon(name){return CLASS_ICON_PATHS[clean(name)]||"";}
function ClassEmblem({name,small=false}){const src=classIcon(name);return src?<img className={small?"cw-mini-emblem":"cw-class-emblem"} src={src} alt=""/>:<span className={small?"cw-mini-emblem":"cw-class-emblem"}>{CLASS_ICONS[clean(name)]||"◆"}</span>;}
function buildOccurrence(dateKeyValue, time, timezone) {
  const [h,m] = String(time||"21:00").split(":").map(Number);
  return zonedDateToUtc(dateKeyValue, h||0, m||0, timezone||PRIMARY_TIMEZONE);
}
function localDateKeys(timezone, startOffset, endOffset) {
  const now = new Date(); const out=[];
  for(let i=startOffset;i<=endOffset;i++){
    const d=new Date(now); d.setDate(d.getDate()+i); out.push(dateKey(d,timezone));
  }
  return out;
}

function Modal({ title, children, onClose, wide=false }) {
  return <div className="cw-modal-backdrop" onMouseDown={onClose}><div className={`cw-modal ${wide?"cw-modal-wide":""}`} onMouseDown={e=>e.stopPropagation()}>
    <div className="cw-modal-head"><div><div className="cw-kicker">CLAN WAR</div><h2>{title}</h2></div><button className="cw-icon-close" onClick={onClose}>×</button></div>
    <div className="cw-modal-body">{children}</div>
  </div></div>;
}

function NoticeItem({ item, timezone, onClick }) {
  const treasury = clean(item.module)==="treasury";
  return <button className="cw-notice-item" onClick={()=>onClick(item)}>
    <span className={`cw-notice-icon ${treasury?"treasury":""}`}>{treasury?"₲":"⚔"}</span>
    <span className="cw-notice-copy"><strong>{clean(item.title)||"Activity"}</strong><span>{clean(item.message)||"Record changed."}</span></span>
    <span className="cw-notice-meta"><b>{formatDateTime(item.createdAt||item.timestamp,timezone)}</b><em>{clean(item.createdBy)||"System"}</em></span><b className="cw-chevron">›</b>
  </button>;
}

export default function CWPage({user,isAdmin}) {
  const { resolvedTimezone } = useGlobalDisplayTimezone();
  const [players,setPlayers]=useState([]), [attendance,setAttendance]=useState([]), [schedules,setSchedules]=useState([]), [notices,setNotices]=useState([]), [treasuryEntries,setTreasuryEntries]=useState([]);
  const [roleSettings,setRoleSettings]=useState({roles:DEFAULT_ROLES});
  const [salarySettings,setSalarySettings]=useState({byClass:{}});
  const [loading,setLoading]=useState(true), [message,setMessage]=useState("");
  const [backDays,setBackDays]=useState(0), [forwardDays,setForwardDays]=useState(0);
  const [activePanel,setActivePanel]=useState("attendance"), [selectedOccurrence,setSelectedOccurrence]=useState(null);
  const [selectedPlayer,setSelectedPlayer]=useState(null), [selectedAttendance,setSelectedAttendance]=useState(null), [auditDetail,setAuditDetail]=useState(null), [allNotices,setAllNotices]=useState(false);
  const [playerHistoryTab,setPlayerHistoryTab]=useState("all"), [playerHistorySearch,setPlayerHistorySearch]=useState(""), [playerHistoryPage,setPlayerHistoryPage]=useState(1);
  const [noticeMode,setNoticeMode]=useState("new"), [noticePage,setNoticePage]=useState(1), [noticeNewPage,setNoticeNewPage]=useState(1), [noticeOldPage,setNoticeOldPage]=useState(1), [noticeSearch,setNoticeSearch]=useState("");
  const [playerSearch,setPlayerSearch]=useState(""), [roleFilter,setRoleFilter]=useState("all"), [classFilter,setClassFilter]=useState("all"), [playerPage,setPlayerPage]=useState(1);
  const [historySearch,setHistorySearch]=useState(""), [historyPage,setHistoryPage]=useState(1);
  const [playerModal,setPlayerModal]=useState(null), [playerForm,setPlayerForm]=useState({ign:"",className:GUILD_CLASSES?.[0]||"Swordman",role:DEFAULT_ROLES[0]});
  const [attendanceModal,setAttendanceModal]=useState(null), [attendanceForm,setAttendanceForm]=useState({salaryGold:"",itemCostGold:"",receivedItem:"",notes:"",adminComment:""});
  const [adminConfirm,setAdminConfirm]=useState(null);
  const [treasuryModal,setTreasuryModal]=useState(null), [treasuryForm,setTreasuryForm]=useState({type:"cw-war-income",amount:"",description:"",item:"",transactionAt:"",adminComment:""});
  const [treasuryEditOriginal,setTreasuryEditOriginal]=useState(null);
  const [scheduleModal,setScheduleModal]=useState(false), [roleModal,setRoleModal]=useState(false), [salaryModal,setSalaryModal]=useState(false), [newRole,setNewRole]=useState("");
  const [scheduleForm,setScheduleForm]=useState({days:CW_DAYS.map(x=>x.key),time:"21:00",timezone:PRIMARY_TIMEZONE});
  const [salaryDraft,setSalaryDraft]=useState({}); const [saving,setSaving]=useState(false); const [now,setNow]=useState(new Date());

  useEffect(() => {
    const unsubscribePlayers = onSnapshot(
      collection(db, "cwPlayers"),
      (snapshot) => {
        setPlayers(
          snapshot.docs.map((playerDoc) => ({
            id: playerDoc.id,
            ...playerDoc.data(),
          }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubscribeAttendance = onSnapshot(
      collection(db, "cwAttendance"),
      (snapshot) => {
        setAttendance(
          snapshot.docs.map((attendanceDoc) => ({
            id: attendanceDoc.id,
            ...attendanceDoc.data(),
          }))
        );
      }
    );

    const unsubscribeSchedules = onSnapshot(
      collection(db, "cwSchedules"),
      (snapshot) => {
        setSchedules(
          snapshot.docs.map((scheduleDoc) => ({
            id: scheduleDoc.id,
            ...scheduleDoc.data(),
          }))
        );
      }
    );

    const unsubscribeSettings = onSnapshot(
      doc(db, "cwSettings", "current"),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};

        setRoleSettings({
          roles:
            Array.isArray(data.roles) && data.roles.length
              ? data.roles
              : DEFAULT_ROLES,
        });

        setSalarySettings({
          byClass:
            data.salaryByClass &&
            typeof data.salaryByClass === "object"
              ? data.salaryByClass
              : {},
        });
      }
    );

    const unsubscribeNotices = onSnapshot(
      collection(db, "guildNotices"),
      (snapshot) => {
        const noticeRows = snapshot.docs
          .map((noticeDoc) => ({
            id: noticeDoc.id,
            ...noticeDoc.data(),
          }))
          .filter((notice) =>
            ["cw-attendance", "treasury"].includes(
              clean(notice.module)
            )
          )
          .sort(
            (a, b) =>
              (safeDate(
                b.createdAt || b.timestamp
              )?.getTime() || 0) -
              (safeDate(
                a.createdAt || a.timestamp
              )?.getTime() || 0)
          );

        setNotices(noticeRows);
      }
    );

    const unsubscribeTreasuryEntries = onSnapshot(
      collection(db, "treasuryEntries"),
      (snapshot) => {
        setTreasuryEntries(
          snapshot.docs.map((entryDoc) => ({
            id: entryDoc.id,
            ...entryDoc.data(),
          }))
        );
      }
    );

    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      unsubscribePlayers();
      unsubscribeAttendance();
      unsubscribeSchedules();
      unsubscribeSettings();
      unsubscribeNotices();
      unsubscribeTreasuryEntries();
      clearInterval(timer);
    };
  }, []);

  const schedule=useMemo(()=>{const a=schedules.filter(x=>x.active!==false);return a[0]||{id:"default",days:CW_DAYS.map(x=>x.key),time:"21:00",timezone:PRIMARY_TIMEZONE,active:true}},[schedules]);
  const baseTz=schedule.timezone||PRIMARY_TIMEZONE;
  const todayKey=dateKey(now,baseTz);
  const occurrences=useMemo(()=>{
    const out=[], days=Array.isArray(schedule.days)?schedule.days:CW_DAYS.map(x=>x.key);
    for(let i=-backDays;i<=forwardDays;i++){
      const temp=new Date(now);temp.setDate(temp.getDate()+i); const key=dateKey(temp,baseTz); const p=partsInZone(temp,baseTz); if(!p)continue;
      const weekday=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))).getUTCDay();
      if(days.includes(weekday)){const at=buildOccurrence(key,schedule.time,baseTz);out.push({key,time:schedule.time,timezone:baseTz,at,day:weekday})}
    }
    return out.sort((a,b)=>(safeDate(a.at)?.getTime()||0)-(safeDate(b.at)?.getTime()||0));
  },[schedule,baseTz,now,backDays,forwardDays]);
  const nextOccurrence=occurrences.find(o=>(safeDate(o.at)?.getTime()||0)>=now.getTime())||occurrences[0];
  const windowOccurrences=useMemo(()=>{const today=occurrences.filter(o=>o.key===todayKey);const rest=occurrences.filter(o=>o.key!==todayKey);return [...today,...rest].slice(0,16);},[occurrences,todayKey]);

  const currentOccurrence=occurrences.find(o=>o.key===todayKey);
  const todayOccurrence=currentOccurrence||null;
  const shownOccurrence=selectedOccurrence||currentOccurrence||nextOccurrence;
  const activePlayers=useMemo(()=>players.filter(p=>p.active!==false).sort((a,b)=>clean(a.ign).localeCompare(clean(b.ign),undefined,{numeric:true,sensitivity:"base"})),[players]);
  const classes=useMemo(()=>Array.from(new Set([...(GUILD_CLASSES||[]),...players.map(p=>clean(p.className||p.class)).filter(Boolean)])),[players]);
  const roles=useMemo(()=>Array.from(new Set([...(roleSettings.roles||DEFAULT_ROLES),...players.map(p=>clean(p.role)).filter(Boolean)])),[roleSettings,players]);
  const filteredPlayers=useMemo(()=>{const q=playerSearch.toLowerCase().trim();return activePlayers.filter(p=>(!q||[p.ign,p.className||p.class,p.role].some(v=>clean(v).toLowerCase().includes(q)))&&(classFilter==="all"||clean(p.className||p.class)===classFilter)&&(roleFilter==="all"||clean(p.role)===roleFilter))},[activePlayers,playerSearch,classFilter,roleFilter]);
  const playerPageCount=Math.max(1,Math.ceil(filteredPlayers.length/PAGE_SIZE));
  const visiblePlayers=filteredPlayers.slice((playerPage-1)*PAGE_SIZE,playerPage*PAGE_SIZE);
  const historyRows=useMemo(()=>attendance.filter(r=>!historySearch.trim()||[r.ign,r.className,r.role,r.receivedItem,r.notes].some(v=>clean(v).toLowerCase().includes(historySearch.toLowerCase().trim()))).sort((a,b)=>String(b.dateKey).localeCompare(String(a.dateKey))),[attendance,historySearch]);
  const historyPageCount=Math.max(1,Math.ceil(historyRows.length/PAGE_SIZE));
  const visibleHistory=historyRows.slice((historyPage-1)*PAGE_SIZE,historyPage*PAGE_SIZE);
  const totalSalary=attendance.reduce((s,r)=>s+num(r.salaryGold),0);
  const totalItems=attendance.filter(r=>clean(r.receivedItem)).length;
  const participatedToday=attendance.filter(r=>clean(r.dateKey)===todayKey).length;

  const noticeDateKey=dateKey(now,resolvedTimezone);
  const noticeSearchLower=noticeSearch.toLowerCase().trim();
  const matchingNotices=useMemo(()=>notices.filter(n=>{
    return !noticeSearchLower||[n.title,n.message,n.createdBy,n.playerName,n.rewardName,n.bossName,n.item,n.description]
      .some(v=>clean(v).toLowerCase().includes(noticeSearchLower));
  }),[notices,noticeSearchLower]);
  const newNotices=useMemo(()=>matchingNotices.filter(n=>dateKey(n.createdAt||n.timestamp,resolvedTimezone)===noticeDateKey),[matchingNotices,resolvedTimezone,noticeDateKey]);
  const oldNotices=useMemo(()=>matchingNotices.filter(n=>dateKey(n.createdAt||n.timestamp,resolvedTimezone)!==noticeDateKey),[matchingNotices,resolvedTimezone,noticeDateKey]);
  const newPageCount=Math.max(1,Math.ceil(newNotices.length/PAGE_SIZE));
  const oldPageCount=Math.max(1,Math.ceil(oldNotices.length/PAGE_SIZE));
  const visibleNewNotices=newNotices.slice((noticeNewPage-1)*PAGE_SIZE,noticeNewPage*PAGE_SIZE);
  const visibleOldNotices=oldNotices.slice((noticeOldPage-1)*PAGE_SIZE,noticeOldPage*PAGE_SIZE);
  const newCount=newNotices.length;
  const oldCount=oldNotices.length;

  useEffect(()=>{setNoticePage(1);setNoticeNewPage(1);setNoticeOldPage(1)},[noticeSearch]);

  function requireAdminComment(title, message, action){
    if(!isAdmin) return;
    setAdminConfirm({title,message,comment:"",action});
  }

  async function runAdminAction(){
    if(!adminConfirm) return;
    const comment=clean(adminConfirm.comment);
    if(!comment){setMessage("Admin comment is required for this action.");return;}
    setSaving(true);
    try{await adminConfirm.action(comment);setAdminConfirm(null);}catch(e){console.error(e);setMessage(e?.message||"Action failed.");}finally{setSaving(false);}
  }

  async function audit(payload){try{await addDoc(collection(db,"guildNotices"),{module:payload.module||"cw-attendance",title:payload.title||"CW activity",message:payload.message||"",type:"info",active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),timestamp:serverTimestamp(),createdBy:actor(user),createdByUid:user?.uid||null,entityType:payload.entityType||"",entityId:payload.entityId||"",playerId:payload.playerId||null,playerName:payload.playerName||"",bossName:payload.bossName||"",details:Array.isArray(payload.details)?payload.details:[],changes:Array.isArray(payload.changes)?payload.changes:[]})}catch(e){console.error(e)}}

  function openAddPlayer(){setPlayerForm({ign:"",className:classes[0]||"Swordman",role:roles[0]||DEFAULT_ROLES[0]});setPlayerModal({mode:"add"})}
  function openEditPlayer(p){setPlayerForm({ign:clean(p.ign),className:clean(p.className||p.class),role:clean(p.role)||roles[0]});setPlayerModal({mode:"edit",player:p})}
  async function savePlayer(){
    if(!isAdmin)return;
    const ign=clean(playerForm.ign);
    if(!ign){setMessage("IGN is required.");return}
    if(players.some(p=>clean(p.ign).toLowerCase()===ign.toLowerCase()&&p.id!==playerModal?.player?.id)){setMessage("That IGN already exists.");return}
    if(playerModal.mode==="edit"){
      const p=playerModal.player;
      requireAdminComment("EDIT CW PLAYER","An admin comment is required and will be written to the guild audit log.",async(comment)=>{
        await updateDoc(doc(db,"cwPlayers",p.id),{ign,className:playerForm.className,role:playerForm.role,updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null});
        await audit({title:"CW PLAYER UPDATED",message:`${ign} player profile was updated by ${actor(user)}.`,entityType:"cw-player",entityId:p.id,playerId:p.id,playerName:ign,changes:[{field:"IGN",from:clean(p.ign),to:ign},{field:"Class",from:clean(p.className||p.class),to:playerForm.className},{field:"Role",from:clean(p.role),to:playerForm.role}],details:[`Admin comment: ${comment}`]});
        setPlayerModal(null);setMessage("Player updated.");
      });
      return;
    }
    setSaving(true);
    try{const ref=await addDoc(collection(db,"cwPlayers"),{ign,className:playerForm.className,role:playerForm.role,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:actor(user),createdByUid:user?.uid||null});await audit({title:"CW PLAYER ADDED",message:`${ign} was added to the Clan War roster.`,entityType:"cw-player",entityId:ref.id,playerId:ref.id,playerName:ign,details:[`Class: ${playerForm.className}`,`Role: ${playerForm.role}`]});setPlayerModal(null);setMessage("Player saved.");}catch(e){setMessage(e?.message||"Unable to save player.")}finally{setSaving(false)}
  }
  async function deletePlayer(p){
    if(!isAdmin)return;
    requireAdminComment("DELETE CW PLAYER",`Delete ${p.ign} from the CW roster? History will be preserved.`,async(comment)=>{
      await deleteDoc(doc(db,"cwPlayers",p.id));
      await audit({title:"CW PLAYER DELETED",message:`${p.ign} was removed from the Clan War roster.`,entityType:"cw-player",entityId:p.id,playerId:p.id,playerName:p.ign,details:["Historical CW attendance records were preserved.",`Admin comment: ${comment}`]});
      setMessage("Player deleted.");
    });
  }

  function openAttendance(p,occ=shownOccurrence,mode="edit"){
    if(!isAdmin||!occ)return;
    const existing=attendance.find(r=>String(r.playerId)===String(p.id)&&clean(r.dateKey)===occ.key);
    if(!existing && clean(occ.key)!==todayKey){setMessage("CW clock-in is only available for today. Select TODAY to mark attendance.");return;}
    const className=clean(p.className||p.class);
    setAttendanceForm({salaryGold:existing?existing.salaryGold:String(num(salarySettings.byClass?.[className],0)||""),itemCostGold:existing?.itemCostGold||"",receivedItem:existing?.receivedItem||"",notes:existing?.notes||"",adminComment:""});
    setAttendanceModal({player:p,occurrence:occ,existing,mode});
  }
  function openAttendanceRecord(row,mode="edit"){
    const p=players.find(x=>String(x.id)===String(row.playerId));
    const occ=occurrences.find(x=>x.key===row.dateKey)||{key:row.dateKey,time:row.scheduledTime||schedule.time,timezone:row.scheduledTimezone||baseTz,at:safeDate(row.scheduledAt)||buildOccurrence(row.dateKey,row.scheduledTime||schedule.time,row.scheduledTimezone||baseTz)};
    if(p) openAttendance(p,occ,mode);
  }
  async function saveAttendance(){
    if(!isAdmin||!attendanceModal)return;
    const {player,occurrence,existing,mode}=attendanceModal;
    if(existing && !clean(attendanceForm.adminComment)){setMessage("Admin comment is required when editing or overriding attendance.");return;}
    setSaving(true);
    try{
      const salary=num(attendanceForm.salaryGold), itemCost=num(attendanceForm.itemCostGold);
      const payload={playerId:String(player.id),ign:clean(player.ign),className:clean(player.className||player.class),role:clean(player.role),dateKey:occurrence.key,scheduledTime:occurrence.time,scheduledTimezone:baseTz,scheduledAt:occurrence.at,attended:true,salaryGold:salary,itemCostGold:itemCost,receivedItem:clean(attendanceForm.receivedItem),notes:clean(attendanceForm.notes),manualOverride:mode==="override"||Boolean(existing?.manualOverride),adminComment:clean(attendanceForm.adminComment),updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null};
      let id=existing?.id;
      if(existing) await updateDoc(doc(db,"cwAttendance",id),payload);
      else { id=(await addDoc(collection(db,"cwAttendance"),{...payload,createdAt:serverTimestamp(),createdBy:actor(user),createdByUid:user?.uid||null})).id; }
      await updateDoc(doc(db,"cwPlayers",player.id),{updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null});
      const prior=treasuryEntries.filter(e=>String(e.sourceAttendanceId||"")===String(id));
      async function upsert(type,amount,description,item){const old=prior.find(e=>e.ledgerType===type);if(!amount){if(old)await deleteDoc(doc(db,"treasuryEntries",old.id));return;}const data={type:type==="salary"?"cw-salary":"item-purchase",ledgerType:type,direction:"out",amount:-Math.abs(amount),playerId:String(player.id),playerName:clean(player.ign),dateKey:occurrence.key,description,item:clean(item),sourceAttendanceId:String(id),sourceModule:"cw-attendance",transactionAt:occurrence.at,updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null};if(old)await updateDoc(doc(db,"treasuryEntries",old.id),data);else await addDoc(collection(db,"treasuryEntries"),{...data,createdAt:serverTimestamp(),createdBy:actor(user),createdByUid:user?.uid||null});}
      await upsert("salary",salary,`CW salary — ${player.ign}`,"");
      await upsert("item",itemCost,`CW item handed out — ${player.ign}`,attendanceForm.receivedItem);
      await audit({title:mode==="override"?"CW ATTENDANCE OVERRIDDEN":existing?"CW ATTENDANCE UPDATED":"CW ATTENDANCE RECORDED",message:`${player.ign} Clan War attendance for ${occurrence.key} was ${mode==="override"?"overridden":"saved"}.`,entityType:"cw-attendance",entityId:id,playerId:player.id,playerName:player.ign,details:[`CW date: ${formatDate(occurrence.at,resolvedTimezone)}`,`Class: ${player.className||player.class}`,`Role: ${player.role}`,`Salary: ₲ ${money(salary)}`,`Item cost: ₲ ${money(itemCost)}`,`Received: ${clean(attendanceForm.receivedItem)||"Nothing recorded"}`,`Action: ${mode==="override"?"OVERRIDE":existing?"EDIT":"ADD"}`,`Admin comment: ${clean(attendanceForm.adminComment)||"None"}`,`Changed by: ${actor(user)}`]});
      if(clean(attendanceForm.receivedItem)) await audit({module:"treasury",title:"TREASURY CW ITEM HANDED OUT",message:`${attendanceForm.receivedItem} was handed to ${player.ign} during Clan War.`,entityType:"treasury-item",entityId:id,playerId:player.id,playerName:player.ign,details:[`Item: ${attendanceForm.receivedItem}`,`Item cost: ₲ ${money(itemCost)}`,`CW date: ${formatDate(occurrence.at,resolvedTimezone)}`]});
      setAttendanceModal(null);setMessage(mode==="override"?"CW attendance overridden and logged.":existing?"CW attendance updated and logged.":"CW attendance saved.");
    }catch(e){console.error(e);setMessage(e?.message||"Unable to save attendance.")}finally{setSaving(false)}
  }

  function requestDeleteAttendance(row){
    if(!isAdmin)return;
    requireAdminComment("DELETE CW ATTENDANCE",`Delete ${row.ign||"this player"}'s CW attendance for ${row.dateKey}? Treasury reversal entries will be created.`,async(comment)=>{
      const prior=treasuryEntries.filter(e=>String(e.sourceAttendanceId||"")===String(row.id));
      for(const e of prior){const amt=Math.abs(num(e.amount));if(amt)await addDoc(collection(db,"treasuryEntries"),{type:e.ledgerType==="item"?"item-purchase-reversal":"cw-salary-reversal",ledgerType:e.ledgerType||"salary",direction:"in",amount:amt,playerId:row.playerId||null,playerName:row.ign||"",dateKey:row.dateKey||"",description:`Reversal — ${row.ign||"player"}`,sourceAttendanceId:String(row.id),sourceModule:"cw-attendance",transactionAt:safeDate(row.scheduledAt)||new Date(),createdAt:serverTimestamp(),createdBy:actor(user),createdByUid:user?.uid||null});}
      await deleteDoc(doc(db,"cwAttendance",row.id));
      if(row.playerId) await updateDoc(doc(db,"cwPlayers",row.playerId),{updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null});
      await audit({title:"CW ATTENDANCE DELETED",message:`${row.ign||"Player"} CW attendance was deleted for ${row.dateKey}.`,entityType:"cw-attendance",entityId:row.id,playerId:row.playerId,playerName:row.ign,details:["Attendance record deleted and Treasury reversal entries created.",`Admin comment: ${comment}`,`Deleted by: ${actor(user)}`]});
      setSelectedAttendance(null);setAttendanceModal(null);setMessage("CW attendance deleted and Treasury reversed.");
    });
  }

  // Treasury source of truth: every signed ledger entry contributes to the balance.
  // Manual "Available Gold" overrides are stored as delta entries, so the current balance
  // can be corrected without deleting or rewriting the historical ledger.
  const treasuryBalance=treasuryEntries.reduce((sum,e)=>sum+num(e.amount),0);
  const treasurySalaryNet=treasuryEntries.filter(e=>e.type==="cw-salary"||e.type==="cw-salary-reversal").reduce((sum,e)=>sum+num(e.amount),0);
  const treasuryItemNet=treasuryEntries.filter(e=>e.type==="item-purchase"||e.type==="item-purchase-reversal").reduce((sum,e)=>sum+num(e.amount),0);
  const treasurySalaryOut=Math.max(0,-treasurySalaryNet);
  const treasuryItemOut=Math.max(0,-treasuryItemNet);
  const treasuryIncome=treasuryEntries.filter(e=>e.type==="cw-war-income"||e.type==="guild-income").reduce((sum,e)=>sum+Math.max(0,num(e.amount)),0);
  const latestTreasuryIncome=treasuryEntries.filter(e=>e.type==="cw-war-income"||e.type==="guild-income").slice().sort((a,b)=>(safeDate(b.transactionAt||b.createdAt)?.getTime()||0)-(safeDate(a.transactionAt||a.createdAt)?.getTime()||0))[0];
  const treasuryOverrides=treasuryEntries.filter(e=>e.type==="balance-override").reduce((sum,e)=>sum+num(e.amount),0);

  async function saveTreasuryEntry(){
    if(!isAdmin)return;
    const amount=num(treasuryForm.amount);
    const transactionAt=zonedDateTimeInputToUtc(treasuryForm.transactionAt,resolvedTimezone);
    if(!amount||!clean(treasuryForm.description)){setMessage("Amount and description are required.");return;}
    if(!transactionAt){setMessage("Date and time are required.");return;}
    setSaving(true);
    try{
      const incoming=treasuryForm.type==="cw-war-income"||treasuryForm.type==="guild-income";
      const sign=incoming?1:-1;
      const data={type:treasuryForm.type,direction:incoming?"in":"out",amount:sign*amount,description:clean(treasuryForm.description),item:clean(treasuryForm.item),adminComment:clean(treasuryForm.adminComment),transactionAt,createdAt:serverTimestamp(),createdBy:actor(user),createdByUid:user?.uid||null};
      const ref=await addDoc(collection(db,"treasuryEntries"),data);
      await audit({module:"treasury",title:incoming?"TREASURY GOLD RECEIVED":"TREASURY EXPENSE ADDED",message:`${clean(treasuryForm.description)} recorded for ${incoming?"+":"-"}₲ ${money(amount)}.`,entityType:"treasury-entry",entityId:ref.id,details:[`Amount: ${incoming?"+":"-"}₲ ${money(amount)}`,`Transaction date/time: ${formatDateTime(transactionAt,resolvedTimezone)}`,clean(treasuryForm.item)?`Item: ${clean(treasuryForm.item)}`:"",`Admin comment: ${clean(treasuryForm.adminComment)||"None"}`,`Recorded by: ${actor(user)}`]});
      setTreasuryModal(null);setMessage("Treasury entry saved and logged.");
    }catch(e){setMessage(e?.message||"Unable to save treasury entry.")}finally{setSaving(false)}
  }

  async function saveTreasuryEdit(){
    if(!isAdmin||!treasuryEditOriginal)return;
    const original=treasuryEditOriginal;
    const amount=num(treasuryForm.amount);
    const comment=clean(treasuryForm.adminComment);
    const transactionAt=zonedDateTimeInputToUtc(treasuryForm.transactionAt,resolvedTimezone);
    if(!comment){setMessage("Admin comment is required when editing a treasury entry.");return;}
    if(original.type!=="balance-override" && !transactionAt){setMessage("Date and time are required.");return;}
    if(amount<0){setMessage("Amount cannot be negative. Enter the positive value; the transaction type controls the sign.");return;}
    setSaving(true);
    try{
      const linkedAttendanceId=clean(original.sourceAttendanceId);
      const linkedAttendance=linkedAttendanceId?attendance.find(r=>String(r.id)===linkedAttendanceId):null;

      // CW salary/item Treasury rows are controlled by their attendance record.
      // Editing here updates the attendance record AND the linked Treasury row so both views stay synchronized.
      if(linkedAttendance && (original.type==="cw-salary" || original.type==="item-purchase")){
        const isSalary=original.type==="cw-salary";
        const nextSalary=isSalary?amount:num(linkedAttendance.salaryGold);
        const nextItemCost=isSalary?num(linkedAttendance.itemCostGold):amount;
        const nextItem=isSalary?clean(linkedAttendance.receivedItem):clean(treasuryForm.item);
        const nextDescription=clean(treasuryForm.description);
        const attendancePatch={
          salaryGold:nextSalary,
          itemCostGold:nextItemCost,
          receivedItem:nextItem,
          updatedAt:serverTimestamp(),
          updatedBy:actor(user),
          updatedByUid:user?.uid||null,
          adminComment:comment,
        };
        await updateDoc(doc(db,"cwAttendance",linkedAttendance.id),attendancePatch);
        if(amount===0){
          await deleteDoc(doc(db,"treasuryEntries",original.id));
        }else{
          await updateDoc(doc(db,"treasuryEntries",original.id),{
            transactionAt,
            amount:-Math.abs(amount),
            direction:"out",
            type:isSalary?"cw-salary":"item-purchase",
            ledgerType:isSalary?"salary":"item",
            description:nextDescription||original.description||`${isSalary?"CW salary":"CW item handed out"} — ${linkedAttendance.ign}`,
            item:isSalary?"":nextItem,
            adminComment:comment,
            updatedAt:serverTimestamp(),
            updatedBy:actor(user),
            updatedByUid:user?.uid||null,
          });
        }
        await updateDoc(doc(db,"cwPlayers",linkedAttendance.playerId),{updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null}).catch(()=>{});
        await audit({module:"treasury",title:"LINKED CW TREASURY ENTRY EDITED",message:`${linkedAttendance.ign} ${isSalary?"salary":"item cost"} was edited from Treasury and synchronized with CW attendance.`,entityType:"treasury-entry",entityId:original.id,playerId:linkedAttendance.playerId,playerName:linkedAttendance.ign,details:[`Old amount: ₲ ${money(Math.abs(num(original.amount)))}`,`New amount: ₲ ${money(amount)}`,`CW date: ${linkedAttendance.dateKey}`,`Item: ${nextItem||"—"}`,`Reason: ${comment}`,`Edited by: ${actor(user)}`],changes:[{field:isSalary?"CW Salary":"Item Cost",from:`₲ ${money(Math.abs(num(original.amount)))}`,to:`₲ ${money(amount)}`}]});
        setTreasuryEditOriginal(null);setTreasuryModal(null);setMessage("Treasury entry edited and CW attendance synchronized.");
        return;
      }

      // A balance override is a signed delta. Editing it means choosing a new target balance.
      if(original.type==="balance-override"){
        const current=treasuryBalance;
        const baseWithoutOriginal=current-num(original.amount);
        const nextDelta=amount-baseWithoutOriginal;
        await updateDoc(doc(db,"treasuryEntries",original.id),{
          direction:nextDelta>=0?"in":"out",amount:nextDelta,overrideTarget:amount,balanceBefore:baseWithoutOriginal,balanceAfter:amount,adminComment:comment,updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null
        });
        await audit({module:"treasury",title:"BALANCE OVERRIDE EDITED",message:`Available Guild Gold override was changed to ₲ ${money(amount)}.`,entityType:"treasury-balance-override",entityId:original.id,details:[`Old target: ₲ ${money(original.overrideTarget ?? original.balanceAfter ?? 0)}`,`New target: ₲ ${money(amount)}`,`Reason: ${comment}`,`Edited by: ${actor(user)}`],changes:[{field:"Override target",from:`₲ ${money(original.overrideTarget ?? original.balanceAfter ?? 0)}`,to:`₲ ${money(amount)}`}]});
        setTreasuryEditOriginal(null);setTreasuryModal(null);setMessage("Balance override edited and logged.");
        return;
      }

      const incoming=treasuryForm.type==="cw-war-income"||treasuryForm.type==="guild-income";
      const sign=incoming?1:-1;
      const next={type:treasuryForm.type,direction:incoming?"in":"out",amount:sign*amount,description:clean(treasuryForm.description),item:clean(treasuryForm.item),adminComment:comment,transactionAt,updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null};
      await updateDoc(doc(db,"treasuryEntries",original.id),next);
      await audit({module:"treasury",title:"TREASURY ENTRY EDITED",message:`Treasury entry ${original.description||original.id} was edited.`,entityType:"treasury-entry",entityId:original.id,details:[`Old amount: ${num(original.amount)>=0?"+":"-"}₲ ${money(Math.abs(num(original.amount)))}`,`New amount: ${incoming?"+":"-"}₲ ${money(amount)}`,`Old description: ${original.description||"—"}`,`New description: ${clean(treasuryForm.description)}`,`Item: ${clean(treasuryForm.item)||"—"}`,`Reason: ${comment}`,`Edited by: ${actor(user)}`],changes:[{field:"Amount",from:`₲ ${money(Math.abs(num(original.amount)))}`,to:`${incoming?"+":"-"}₲ ${money(amount)}`},{field:"Description",from:original.description||"—",to:clean(treasuryForm.description)}]});
      setTreasuryEditOriginal(null);setTreasuryModal(null);setMessage("Treasury entry edited and logged.");
    }catch(e){console.error(e);setMessage(e?.message||"Unable to edit treasury entry.")}finally{setSaving(false)}
  }

  function requestDeleteTreasuryEntry(entry){
    if(!isAdmin)return;
    requireAdminComment("DELETE TREASURY ENTRY",`Delete ${entry.description||"this treasury entry"}? The change will be reflected in Guild Gold and recorded in the audit trail.`,async(comment)=>{
      const linkedAttendanceId=clean(entry.sourceAttendanceId);
      const linkedAttendance=linkedAttendanceId?attendance.find(r=>String(r.id)===linkedAttendanceId):null;
      try{
        if(linkedAttendance && (entry.type==="cw-salary" || entry.type==="item-purchase")){
          const isSalary=entry.type==="cw-salary";
          await updateDoc(doc(db,"cwAttendance",linkedAttendance.id),{
            ...(isSalary?{salaryGold:0}:{itemCostGold:0,receivedItem:""}),
            updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null,adminComment:comment
          });
          await deleteDoc(doc(db,"treasuryEntries",entry.id));
          await audit({module:"treasury",title:"LINKED CW TREASURY ENTRY DELETED",message:`${linkedAttendance.ign} ${isSalary?"salary":"item cost"} Treasury entry was deleted and the CW attendance record was synchronized.`,entityType:"treasury-entry",entityId:entry.id,playerId:linkedAttendance.playerId,playerName:linkedAttendance.ign,details:[`Deleted amount: -₲ ${money(Math.abs(num(entry.amount)))}`,`CW date: ${linkedAttendance.dateKey}`,`Reason: ${comment}`,`Deleted by: ${actor(user)}`]});
          setMessage("Treasury entry deleted and CW attendance synchronized.");
          return;
        }
        await deleteDoc(doc(db,"treasuryEntries",entry.id));
        await audit({module:"treasury",title:"TREASURY ENTRY DELETED",message:`${entry.description||"Treasury entry"} was deleted.`,entityType:"treasury-entry",entityId:entry.id,details:[`Deleted amount: ${num(entry.amount)>=0?"+":"-"}₲ ${money(Math.abs(num(entry.amount)))}`,`Description: ${entry.description||"—"}`,`Reason: ${comment}`,`Deleted by: ${actor(user)}`]});
        setMessage("Treasury entry deleted and logged.");
      }catch(e){setMessage(e?.message||"Unable to delete treasury entry.")}
    });
  }

  function openTreasuryEdit(entry){
    if(!isAdmin)return;
    const isOverride=entry.type==="balance-override";
    setTreasuryEditOriginal(entry);
    if(isOverride){
      setTreasuryForm({type:"balance-override",amount:String(entry.overrideTarget ?? entry.balanceAfter ?? treasuryBalance),description:entry.description||"Available Guild Gold Override",item:"",transactionAt:dateTimeInputValue(entry.transactionAt||entry.createdAt||new Date(),resolvedTimezone),adminComment:""});
      setTreasuryModal("edit");
      return;
    }
    setTreasuryForm({
      type:(entry.type==="cw-war-income"||entry.type==="guild-income")?"cw-war-income":entry.type==="item-purchase"?"item-purchase":"expense",
      amount:formatMoneyInput(Math.abs(num(entry.amount))),
      description:entry.description||"",
      item:entry.item||"",
      transactionAt:dateTimeInputValue(entry.transactionAt||entry.createdAt||new Date(),resolvedTimezone),
      adminComment:""
    });
    setTreasuryModal("edit");
  }

  async function saveTreasuryOverride(){
    if(!isAdmin)return;
    const target=num(treasuryForm.amount);
    const comment=clean(treasuryForm.adminComment);
    
    if(!comment){setMessage("A reason is required when overriding Available Guild Gold.");return;}
    const current=treasuryBalance;
    const delta=target-current;
    if(delta===0){setMessage("Available Guild Gold is already at that amount.");setTreasuryModal(null);return;}
    setSaving(true);
    try{
      const ref=await addDoc(collection(db,"treasuryEntries"),{
        type:"balance-override",
        direction:delta>=0?"in":"out",
        amount:delta,
        description:"Available Guild Gold Override",
        item:"",
        adminComment:comment,
        overrideTarget:target,
        balanceBefore:current,
        balanceAfter:target,
        createdAt:serverTimestamp(),
        createdBy:actor(user),
        createdByUid:user?.uid||null
      });
      await audit({
        module:"treasury",
        title:"AVAILABLE GUILD GOLD OVERRIDDEN",
        message:`Available Guild Gold was corrected from ₲ ${money(current)} to ₲ ${money(target)}.`,
        entityType:"treasury-balance-override",
        entityId:ref.id,
        details:[
          `Balance before: ₲ ${money(current)}`,
          `New available balance: ₲ ${money(target)}`,
          `Adjustment recorded: ${delta>=0?"+":"-"}₲ ${money(Math.abs(delta))}`,
          `Reason: ${comment}`,
          `Overridden by: ${actor(user)}`
        ],
        changes:[{field:"Available Guild Gold",from:`₲ ${money(current)}`,to:`₲ ${money(target)}`}]
      });
      setTreasuryModal(null);
      setMessage("Available Guild Gold overridden and logged.");
    }catch(e){setMessage(e?.message||"Unable to override Available Guild Gold.")}finally{setSaving(false)}
  }

  function openScheduleEditor(){setScheduleForm({days:Array.isArray(schedule.days)&&schedule.days.length?schedule.days:CW_DAYS.map(x=>x.key),time:schedule.time||"21:00",timezone:PRIMARY_TIMEZONE});setScheduleModal(true)}
  async function saveSchedule(){if(!user){setMessage("Sign in to change the Clan War occurrence.");return}if(!scheduleForm.days.length){setMessage("Select at least one day.");return}setSaving(true);try{const id=schedule.id!=="default"?schedule.id:"current";await setDoc(doc(db,"cwSchedules",id),{days:scheduleForm.days.slice().sort((a,b)=>a-b),time:scheduleForm.time,timezone:PRIMARY_TIMEZONE,active:true,updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null},{merge:true});await audit({title:"CW SCHEDULE UPDATED",message:`Clan War occurrence changed to ${scheduleForm.days.map(d=>CW_DAYS.find(x=>x.key===d)?.label).join(", ")} at ${scheduleForm.time} Manila.`,entityType:"cw-schedule",entityId:id,details:[`Days: ${scheduleForm.days.map(d=>CW_DAYS.find(x=>x.key===d)?.label).join(", ")}`,`Base time: ${scheduleForm.time} ${PRIMARY_TIMEZONE}`,`Changed by: ${actor(user)}`]});setScheduleModal(false);setMessage("Clan War occurrence updated.")}catch(e){setMessage(e?.message||"Unable to update schedule.")}finally{setSaving(false)}}
  function toggleDay(day){setScheduleForm(f=>({...f,days:f.days.includes(day)?f.days.filter(x=>x!==day):[...f.days,day]}))}

  function openSalaryEditor(){setSalaryDraft(Object.fromEntries(classes.map(c=>[c,String(num(salarySettings.byClass?.[c],0)||"")])));setSalaryModal(true)}
  async function saveSalaries(){if(!isAdmin)return;setSaving(true);try{const next={};classes.forEach(c=>{next[c]=num(salaryDraft[c],0)});const old=salarySettings.byClass||{};await setDoc(doc(db,"cwSettings","current"),{salaryByClass:next,updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null},{merge:true});const changes=classes.filter(c=>num(old[c])!==num(next[c])).map(c=>({field:`${c} salary`,from:`₲ ${money(old[c])}`,to:`₲ ${money(next[c])}`}));if(changes.length)await audit({title:"CW CLASS SALARY UPDATED",message:"Clan War salary rates were changed by an administrator.",entityType:"cw-salary-settings",changes,details:["These class salary rates apply as the default for new attendance records.",`Updated by: ${actor(user)}`]});setSalaryModal(null);setMessage("CW class salary rates saved.")}catch(e){setMessage(e?.message||"Unable to save salary rates.")}finally{setSaving(false)}}

  function selectOccurrence(occ){setSelectedOccurrence(occ);setActivePanel("attendance");setTimeout(()=>document.getElementById("cw-attendance-panel")?.scrollIntoView({behavior:"smooth",block:"start"}),50)}
  function statsFor(p){const rows=attendance.filter(r=>String(r.playerId)===String(p.id));const sorted=rows.slice().sort((a,b)=>(safeDate(b.updatedAt||b.createdAt)?.getTime()||0)-(safeDate(a.updatedAt||a.createdAt)?.getTime()||0));return {days:rows.length,salary:rows.reduce((s,r)=>s+num(r.salaryGold),0),latestSalary:sorted[0]?.salaryGold||0,items:rows.filter(r=>clean(r.receivedItem)).length,lastItem:sorted.find(r=>clean(r.receivedItem))?.receivedItem||"—",lastUpdated:p.updatedAt&&safeDate(p.updatedAt)?.getTime()>(safeDate(sorted[0]?.updatedAt||sorted[0]?.createdAt)?.getTime()||0)?p.updatedAt:(sorted[0]?.updatedAt||sorted[0]?.createdAt||p.updatedAt||p.createdAt),lastBy:p.updatedBy||sorted[0]?.updatedBy||sorted[0]?.createdBy||p.createdBy||"System"}}

  return <div className="cw-page">
    <section className="cw-hero"><div><div className="cw-kicker">RAN ONLINE EP7 CLASSIC • CLAN WAR</div><h1>CW Attendance</h1><p>Track Clan War participation, class salaries, items handed out and the connected audit trail that feeds Guild Treasury.</p></div><div className="cw-hero-side"><span className="cw-live-dot">● LIVE</span><div className="cw-updated">{loading?"SYNCING...":"REALTIME FIREBASE"}</div><div className="cw-timezone-label">DISPLAYING IN {resolvedTimezone}</div></div></section>
    {message&&<div className="cw-message">{message}<button onClick={()=>setMessage("")}>×</button></div>}

    <section className="cw-stats">
      <div className="cw-stat"><span>⚔</span><div><small>REGISTERED PLAYERS</small><strong>{activePlayers.length}</strong><em>CW ROSTER</em></div></div>
      <div className="cw-stat"><span>◷</span><div><small>NEXT CLAN WAR</small><strong>{nextOccurrence?formatDateTime(nextOccurrence.at,resolvedTimezone):"—"}</strong><em>{nextOccurrence?diffText((safeDate(nextOccurrence.at)?.getTime()||now.getTime())-now.getTime()):"NO SCHEDULE"}</em></div></div>
      <div className="cw-stat"><span>₲</span><div><small>CW SALARY HANDED OUT</small><strong>₲ {money(totalSalary)}</strong><em>LIFETIME PAYOUTS</em></div></div>
      <div className="cw-stat"><span>▣</span><div><small>ITEMS RECORDED</small><strong>{totalItems}</strong><em>{participatedToday} ATTENDED TODAY</em></div></div>
    </section>

    <section className="cw-notification-top cw-notification-board">
      <div className="cw-notification-board-head">
        <div>
          <div className="cw-kicker">GUILD NOTIFICATIONS</div>
          <h2>CW + Treasury Notice Board</h2>
          <p>New activity stays NEW for the current local calendar day. At local midnight it moves to OLD.</p>
        </div>
        <div className="cw-notification-counts">
          <div><strong>{newCount}</strong><span>NEW TODAY</span></div>
          <div><strong>{oldCount}</strong><span>OLD</span></div>
        </div>
      </div>
      <div className="cw-notification-toolbar">
        <input value={noticeSearch} onChange={e=>setNoticeSearch(e.target.value)} placeholder="Search player, action, salary, item..."/>
        <button className="cw-btn" onClick={()=>setAllNotices(true)}>VIEW ALL NOTIFICATIONS ›</button>
      </div>
      <div className="cw-notification-columns">
        <div className="cw-notice-column">
          <div className="cw-notice-column-head"><div><span className="cw-notice-status new">NEW</span><strong>NEW TODAY</strong></div><span>{newNotices.length?`${(noticeNewPage-1)*PAGE_SIZE+1}-${Math.min(noticeNewPage*PAGE_SIZE,newCount)} of ${newCount}`:"0"}</span></div>
          <div className="cw-notice-board-list">
            {visibleNewNotices.map(n=><NoticeItem key={n.id} item={n} timezone={resolvedTimezone} onClick={setAuditDetail}/>)}
            {!visibleNewNotices.length&&<div className="cw-board-empty">No new CW or Treasury activity today.</div>}
          </div>
          <div className="cw-board-pagination">
            <button disabled={noticeNewPage<=1} onClick={()=>setNoticeNewPage(1)}>«</button>
            <button disabled={noticeNewPage<=1} onClick={()=>setNoticeNewPage(p=>Math.max(1,p-1))}>‹</button>
            <b>{Math.min(noticeNewPage,newPageCount)}</b>
            <button disabled={noticeNewPage>=newPageCount} onClick={()=>setNoticeNewPage(p=>Math.min(newPageCount,p+1))}>›</button>
            <button disabled={noticeNewPage>=newPageCount} onClick={()=>setNoticeNewPage(newPageCount)}>»</button>
          </div>
        </div>
        <div className="cw-notice-column">
          <div className="cw-notice-column-head"><div><span className="cw-notice-status old">OLD</span><strong>OLD NOTICES</strong></div><span>{oldNotices.length?`${(noticeOldPage-1)*PAGE_SIZE+1}-${Math.min(noticeOldPage*PAGE_SIZE,oldCount)} of ${oldCount}`:"0"}</span></div>
          <div className="cw-notice-board-list">
            {visibleOldNotices.map(n=><NoticeItem key={n.id} item={n} timezone={resolvedTimezone} onClick={setAuditDetail}/>)}
            {!visibleOldNotices.length&&<div className="cw-board-empty">No old CW or Treasury activity.</div>}
          </div>
          <div className="cw-board-pagination">
            <button disabled={noticeOldPage<=1} onClick={()=>setNoticeOldPage(1)}>«</button>
            <button disabled={noticeOldPage<=1} onClick={()=>setNoticeOldPage(p=>Math.max(1,p-1))}>‹</button>
            <b>{Math.min(noticeOldPage,oldPageCount)}</b>
            <button disabled={noticeOldPage>=oldPageCount} onClick={()=>setNoticeOldPage(p=>Math.min(oldPageCount,p+1))}>›</button>
            <button disabled={noticeOldPage>=oldPageCount} onClick={()=>setNoticeOldPage(oldPageCount)}>»</button>
          </div>
        </div>
      </div>
    </section>

    <section className="cw-date-window">
      <div className="cw-date-window-copy"><div className="cw-kicker">LOCAL CALENDAR WINDOW</div><h2>Browse Clan War Occurrences</h2><p>Today is always pinned first. Choose how far back and forward you want to browse.</p></div>
      <div className="cw-date-window-controls">
        <label><span>BACK</span><select value={backDays} onChange={e=>{setBackDays(num(e.target.value));setSelectedOccurrence(null)}}>{Array.from({length:8},(_,i)=><option key={i} value={i}>{i} {i===1?"DAY":"DAYS"} BACK</option>)}</select></label>
        <button className={backDays===0?"active":""} onClick={()=>{setBackDays(0);setSelectedOccurrence(null)}}>CURRENT / TODAY</button>
        <label><span>FORWARD</span><select value={forwardDays} onChange={e=>{setForwardDays(num(e.target.value));setSelectedOccurrence(null)}}>{Array.from({length:8},(_,i)=><option key={i} value={i}>{i} {i===1?"DAY":"DAYS"} FORWARD</option>)}</select></label>
      </div>
    </section>

    <section className="cw-schedule-panel"><div className="cw-section-head"><div><div className="cw-kicker">CLAN WAR OCCURRENCE</div><h2>Schedule</h2><p>Base schedule: {schedule.time} Asia/Manila • {schedule.days?.map(d=>CW_DAYS.find(x=>x.key===d)?.label).join(" • ")}</p></div><button className="cw-btn cw-btn-primary" onClick={openScheduleEditor}>EDIT OCCURRENCE</button></div>
      <div className="cw-occurrence-grid">{windowOccurrences.map(occ=>{const attended=attendance.filter(r=>clean(r.dateKey)===occ.key).length;return <button key={`${occ.key}-${occ.time}`} className={`cw-occurrence-card ${occ.key===todayKey?"today":""}`} onClick={()=>selectOccurrence(occ)}>
        <div className="cw-war-art"><img className="cw-war-artwork" src={guildWarArtwork} alt="Guild War — Sacred Gate, Phoenix, Mystical Peaks"/><span className="cw-war-logo"><img src={cwWarIcon} alt="Clan War"/></span><span className="cw-war-badge">CLAN WAR</span><div className="cw-war-lines"/></div>
        <div className="cw-occ-body"><div className="cw-occ-date">{formatDate(occ.at,resolvedTimezone)}</div><strong>{formatTime(occ.at,resolvedTimezone)}</strong><span>{occ.key===todayKey?"TODAY":new Intl.DateTimeFormat("en-US",{timeZone:resolvedTimezone,weekday:"long"}).format(occ.at)}</span><div className="cw-occ-foot"><b>{attended} ATTENDED</b><em>{countdownLabel(occ.at,now)}</em></div></div>
      </button>})}</div>
    </section>

    <div className="cw-tabs">
      <button className={activePanel==="attendance"?"active":""} onClick={()=>setActivePanel("attendance")}>⚔ CW ATTENDANCE</button>
      <button className={activePanel==="treasury"?"active":""} onClick={()=>setActivePanel("treasury")}>💰 TREASURY</button>
    </div>

    {activePanel==="attendance"&&<>
      <section className="cw-panel cw-players-history-panel" id="cw-attendance-panel">
        <div className="cw-section-head">
          <div>
            <div className="cw-kicker">CW ROSTER</div>
            <h2>Players & History</h2>
            <p>Use HISTORY for the player's complete CW activity. Daily clock-in: <b>{todayOccurrence?formatDateTime(todayOccurrence.at,resolvedTimezone):"No CW today"}</b></p>
          </div>
          <div className="cw-header-actions">
            {isAdmin&&<button className="cw-btn" onClick={openSalaryEditor}>SALARY BY CLASS</button>}
            {isAdmin&&<button className="cw-btn" onClick={()=>setRoleModal(true)}>MANAGE ROLES</button>}
            {isAdmin&&<button className="cw-btn cw-btn-primary" onClick={openAddPlayer}>＋ ADD NEW PLAYER</button>}
          </div>
        </div>
        <div className="cw-filter-row">
          <input value={playerSearch} onChange={e=>{setPlayerSearch(e.target.value);setPlayerPage(1)}} placeholder="Search IGN, class or role..."/>
          <select value={classFilter} onChange={e=>{setClassFilter(e.target.value);setPlayerPage(1)}}><option value="all">ALL CLASSES</option>{classes.map(c=><option key={c}>{c}</option>)}</select>
          <select value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);setPlayerPage(1)}}><option value="all">ALL ROLES</option>{roles.map(r=><option key={r}>{r}</option>)}</select>
        </div>
        <div className="cw-table-scroll">
          <table className="cw-table cw-player-table">
            <thead><tr><th>PLAYER</th><th>CLASS</th><th>ROLE</th><th>CW DAYS</th><th>LATEST SALARY</th><th>LIFETIME SALARY</th><th>ITEMS</th><th>LAST ITEM</th><th>LAST UPDATED / BY</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {visiblePlayers.map(p=>{
                const s=statsFor(p);
                const attended=attendance.some(r=>String(r.playerId)===String(p.id)&&clean(r.dateKey)===todayKey);
                return <tr key={p.id}>
                  <td><strong>{p.ign}</strong></td>
                  <td><span className="cw-class"><ClassEmblem name={p.className||p.class} small />{p.className||p.class}</span></td>
                  <td><span className="cw-role">{p.role||"—"}</span></td>
                  <td>{s.days}</td>
                  <td className="cw-gold">₲ {money(s.latestSalary)}</td>
                  <td className="cw-gold">₲ {money(s.salary)}</td>
                  <td>{s.items}</td>
                  <td title={s.lastItem}>{s.lastItem}</td>
                  <td>{formatDateTime(s.lastUpdated,resolvedTimezone)}<small>{s.lastBy}</small></td>
                  <td className="cw-player-actions">
                    {isAdmin&&<button className={`cw-btn cw-btn-small ${attended?"cw-btn-recorded":""}`} disabled={!todayOccurrence} onClick={()=>openAttendance(p,todayOccurrence)}>{attended?`✓ ATTENDED • ${formatDateTime(todayOccurrence.at,resolvedTimezone)}`:todayOccurrence?`MARK CW • ${formatDateTime(todayOccurrence.at,resolvedTimezone)}`:"NO CW TODAY"}</button>}
                    <button className="cw-btn cw-btn-small" onClick={()=>{setPlayerHistoryTab("all");setPlayerHistorySearch("");setPlayerHistoryPage(1);setSelectedPlayer(p)}}>HISTORY</button>
                    {isAdmin&&<button className="cw-btn cw-btn-small" onClick={()=>openEditPlayer(p)}>EDIT PROFILE</button>}
                    {isAdmin&&<button className="cw-btn cw-btn-danger cw-btn-small" onClick={()=>deletePlayer(p)}>DELETE</button>}
                  </td>
                </tr>;
              })}
              {!visiblePlayers.length&&<tr><td colSpan="10" className="cw-empty">No players match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="cw-pagination"><button disabled={playerPage<=1} onClick={()=>setPlayerPage(p=>p-1)}>‹</button><span>PAGE {playerPage} OF {playerPageCount} • 10 PLAYERS PER PAGE</span><button disabled={playerPage>=playerPageCount} onClick={()=>setPlayerPage(p=>p+1)}>›</button></div>
      </section>
    </>}

    {activePanel==="treasury"&&<section className="cw-panel cw-treasury-panel">
      <div className="cw-section-head"><div><div className="cw-kicker">CONNECTED GUILD FINANCE</div><h2>Guild Treasury</h2><p><strong>Available Guild Gold</strong> is the current balance from all signed Treasury activity. CW War receipts add funds; CW salaries, item costs and expenses use funds. If the real vault differs, use <strong>OVERRIDE AVAILABLE GOLD</strong> to record the correction without erasing history.</p></div>{isAdmin&&<div className="cw-header-actions"><button className="cw-btn" onClick={()=>{setTreasuryForm({type:"cw-war-income",amount:"",description:"",item:"",transactionAt:dateTimeInputValue(new Date(),resolvedTimezone),adminComment:""});setTreasuryModal("entry")}}>＋ ADD GOLD / EXPENSE</button><button className="cw-btn cw-btn-primary" onClick={()=>{setTreasuryForm({type:"override",amount:formatMoneyInput(treasuryBalance),description:"",item:"",transactionAt:"",adminComment:""});setTreasuryModal("override")}}>OVERRIDE AVAILABLE GOLD</button></div>}</div>
      <div className="cw-treasury-explainer">
        <div><b>CW WAR RECEIPTS</b><span>Gold received from Clan War adds funds to the Treasury.</span></div>
        <div><b>FUNDS USED</b><span>CW salaries, item costs and guild expenses subtract funds.</span></div>
        <div><b>BALANCE CORRECTION</b><span>Override Available Gold only when the recorded ledger does not match the real Guild vault. The difference and reason are permanently logged.</span></div>
      </div>
      <div className="cw-treasury-equation"><span>ALL SIGNED LEDGER ENTRIES</span><b>Σ ₲ {money(treasuryBalance)}</b><i>=</i><span>AVAILABLE GUILD GOLD</span><b className={treasuryBalance<0?"cw-equation-negative":"cw-equation-balance"}>₲ {money(treasuryBalance)}</b><span className="cw-equation-note">Overrides are recorded as balance-correction entries and never erase history.</span></div>
      <div className="cw-treasury-stats">
        <div className={`cw-treasury-stat cw-balance-stat ${treasuryBalance<0?"is-negative":"is-positive"}`}><small>AVAILABLE GUILD GOLD</small><strong>₲ {money(treasuryBalance)}</strong><em>{treasuryBalance<0?"OVERDRAWN — FUNDS BELOW ZERO":"CURRENT GUILD FUNDS"}</em></div>
        <div className="cw-treasury-stat cw-income-stat"><small>RECEIVED FROM CW WAR</small><strong>₲ {money(treasuryIncome)}</strong><em>{latestTreasuryIncome?`LAST RECEIVED • ${formatDateTime(latestTreasuryIncome.transactionAt||latestTreasuryIncome.createdAt,resolvedTimezone)}`:"NO CW WAR RECEIPTS YET"}</em></div>
        <div className="cw-treasury-stat cw-salary-stat"><small>CW SALARY PAID</small><strong>₲ {money(treasurySalaryOut)}</strong><em>FUNDS PAID TO CW PLAYERS</em></div>
        <div className="cw-treasury-stat cw-item-cost-stat"><small>ITEM COSTS / FUNDS USED</small><strong>₲ {money(treasuryItemOut)}</strong><em>FUNDS SPENT ON ITEMS HANDED OUT</em></div>
        
      </div>
      <div className="cw-table-scroll"><table className="cw-table cw-treasury-table"><thead><tr><th>DATE & TIME</th><th>TYPE</th><th>DESCRIPTION</th><th>ITEM</th><th>AMOUNT</th><th>RECORDED / UPDATED BY</th><th>ACTIONS</th></tr></thead><tbody>{treasuryEntries.slice().sort((a,b)=>(safeDate(b.createdAt||b.updatedAt)?.getTime()||0)-(safeDate(a.createdAt||a.updatedAt)?.getTime()||0)).map(e=>{
        const linked=Boolean(e.sourceAttendanceId);
        const typeLabel=e.type==="cw-salary"?"CW SALARY":e.type==="item-purchase"?"ITEM COST":e.type==="cw-salary-reversal"?"SALARY REVERSAL":e.type==="item-purchase-reversal"?"ITEM COST REVERSAL":e.type==="balance-override"?"BALANCE OVERRIDE":e.type==="opening-balance"?"LEGACY OPENING BALANCE":e.type==="balance-adjustment"?"LEGACY BALANCE ADJUSTMENT":(e.type==="cw-war-income"||e.type==="guild-income")?"RECEIVED FROM CW WAR":"GUILD EXPENSE";
        return <tr key={e.id}>
          <td><strong>{formatDateTime(e.transactionAt||e.createdAt||e.updatedAt,resolvedTimezone)}</strong>{e.transactionAt&&<small>Transaction time</small>}</td>
          <td><span className={`cw-ledger-type ${num(e.amount)>=0?"is-in":"is-out"}`}>{typeLabel}</span></td>
          <td><strong>{e.description||"—"}</strong>{e.playerName&&<small>Player: {e.playerName}</small>}{e.adminComment&&<small>Reason: {e.adminComment}</small>}{e.balanceBefore!==undefined&&<small>₲ {money(e.balanceBefore)} → ₲ {money(e.balanceAfter)}</small>}</td>
          <td>{e.item||"—"}</td>
          <td className={num(e.amount)>=0?"cw-in":"cw-out"}>{num(e.amount)>=0?"+":"-"}₲ {money(Math.abs(num(e.amount)))}</td>
          <td>{e.updatedBy||e.createdBy||"System"}<small>{e.updatedAt?formatDateTime(e.updatedAt,resolvedTimezone):""}</small></td>
          <td className="cw-history-actions">{isAdmin&&<><button className="cw-btn cw-btn-small" onClick={()=>openTreasuryEdit(e)}>EDIT</button><button className="cw-btn cw-btn-danger cw-btn-small" onClick={()=>requestDeleteTreasuryEntry(e)}>DELETE</button></> }</td>
        </tr>;
      })}{!treasuryEntries.length&&<tr><td colSpan="7" className="cw-empty">No treasury ledger entries yet.</td></tr>}</tbody></table></div>
    </section>}

    {playerModal&&<Modal title={playerModal.mode==="edit"?`EDIT PLAYER • ${playerModal.player?.ign||""}`:"ADD NEW PLAYER"} onClose={()=>setPlayerModal(null)}>
      <div className="cw-player-form-head">
        <div className="cw-kicker">CW ROSTER PROFILE</div>
        <p>{playerModal.mode==="edit"?"Update the player's IGN, class or Clan War role. Profile changes are recorded in the Guild Notice Board.":"Register a new player for Clan War attendance, salary and item tracking."}</p>
      </div>
      <div className="cw-form-grid cw-player-form-grid">
        <label>PLAYER IGN<input autoFocus value={playerForm.ign} onChange={e=>setPlayerForm({...playerForm,ign:e.target.value})} placeholder="Enter in-game name" onKeyDown={e=>{if(e.key==="Enter")savePlayer()}}/></label>
        <label>CLASS<select value={playerForm.className} onChange={e=>setPlayerForm({...playerForm,className:e.target.value})}>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        <label>ROLE<select value={playerForm.role} onChange={e=>setPlayerForm({...playerForm,role:e.target.value})}>{roles.map(r=><option key={r} value={r}>{r}</option>)}</select></label>
      </div>
      <div className="cw-helper"><b>Player profile:</b> class and role determine the default salary and roster display. Attendance history is never deleted when a player profile is removed.</div>
      <div className="cw-modal-actions">
        <button className="cw-btn" onClick={()=>setPlayerModal(null)}>CANCEL</button>
        <button className="cw-btn cw-btn-primary" disabled={saving||!isAdmin} onClick={savePlayer}>{saving?"SAVING...":playerModal.mode==="edit"?"SAVE PLAYER CHANGES":"ADD PLAYER"}</button>
      </div>
    </Modal>}

    {attendanceModal&&<Modal title={`${attendanceModal.mode==="override"?"OVERRIDE":"EDIT CW ATTENDANCE"} • ${attendanceModal.player.ign}`} wide onClose={()=>setAttendanceModal(null)}><div className="cw-attendance-summary"><strong>{formatDateTime(attendanceModal.occurrence.at,resolvedTimezone)}</strong><span>{attendanceModal.player.className||attendanceModal.player.class} • {attendanceModal.player.role} • Base: {attendanceModal.occurrence.time} {baseTz}</span></div><div className="cw-form-grid"><label>CW CLASS SALARY<input inputMode="decimal" value={attendanceForm.salaryGold} onChange={e=>setAttendanceForm({...attendanceForm,salaryGold:formatMoneyInput(e.target.value)})} placeholder="0"/><small className="cw-field-help">Default comes from {attendanceModal.player.className||attendanceModal.player.class} salary. Admin can adjust this record.</small></label><label>ITEM COST / GOLD HANDED OUT<input inputMode="decimal" value={attendanceForm.itemCostGold} onChange={e=>setAttendanceForm({...attendanceForm,itemCostGold:formatMoneyInput(e.target.value)})} placeholder="0"/></label><label className="cw-span-2">WHAT DID THEY RECEIVE?<textarea value={attendanceForm.receivedItem} onChange={e=>setAttendanceForm({...attendanceForm,receivedItem:e.target.value})} placeholder="Example: PUM BOX • Crazytime Box • Guild consumables"/></label><label className="cw-span-2">NOTES<textarea value={attendanceForm.notes} onChange={e=>setAttendanceForm({...attendanceForm,notes:e.target.value})} placeholder="Example: Weekly Clan War salary and item distribution."/></label>{attendanceModal.existing&&<label className="cw-span-2">ADMIN COMMENT *<textarea value={attendanceForm.adminComment} onChange={e=>setAttendanceForm({...attendanceForm,adminComment:e.target.value})} placeholder={attendanceModal.mode==="override"?"Required. Explain what is being overridden and why...":"Required. Explain why this attendance record is being edited..."}/></label>}</div><div className="cw-helper"><b>How to record:</b> put the salary paid for this CW in the salary field. If an item was handed out, enter its name and its gold cost. Treasury automatically receives the matching minus entries so the Guild Gold Vault stays connected.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={()=>setAttendanceModal(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveAttendance}>{saving?"SAVING...":attendanceModal.mode==="override"?"SAVE OVERRIDE":attendanceModal.existing?"SAVE EDIT":"SAVE CW ATTENDANCE"}</button></div></Modal>}

    {scheduleModal&&<Modal title="EDIT CLAN WAR OCCURRENCE" onClose={()=>setScheduleModal(false)}><div className="cw-label">CW DAYS</div><div className="cw-day-picks">{CW_DAYS.map(d=><button key={d.key} className={scheduleForm.days.includes(d.key)?"selected":""} onClick={()=>toggleDay(d.key)}>{d.label}</button>)}</div><div className="cw-form-grid"><label>BASE TIME<input type="time" value={scheduleForm.time} onChange={e=>setScheduleForm({...scheduleForm,time:e.target.value})}/></label><label>BASE TIMEZONE<input value="Philippines — Manila (Asia/Manila)" readOnly/></label></div><div className="cw-helper">Clan War is stored in Manila time. The global DISPLAY TIMEZONE selector only changes how the schedule is displayed to each viewer. Example: 9:00 PM Manila automatically converts to the viewer's browser/custom timezone.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={()=>setScheduleModal(false)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveSchedule}>SAVE OCCURRENCE</button></div></Modal>}

    {salaryModal&&<Modal title="CW SALARY BY CLASS" wide onClose={()=>setSalaryModal(false)}><div className="cw-salary-intro">Set the default Clan War salary for each class. When an admin marks attendance, this amount is prefilled. Changing these rates creates a notification visible to the guild.</div><div className="cw-salary-grid">{classes.map(c=><label key={c}><span><ClassEmblem name={c} small />{c}</span><div><input inputMode="decimal" value={salaryDraft[c]??""} onChange={e=>setSalaryDraft({...salaryDraft,[c]:formatMoneyInput(e.target.value)})} placeholder="0"/><em>GOLD / CW</em></div></label>)}</div><div className="cw-helper">Example: Extreme = 500,000 gold per CW. You can change any class rate later. Players will see the change in the shared CW + Treasury notification stream.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={()=>setSalaryModal(false)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveSalaries}>SAVE SALARY RATES</button></div></Modal>}

    {roleModal&&<Modal title="MANAGE CW ROLES" onClose={()=>setRoleModal(false)}><div className="cw-helper">Add future roles without changing the code. Existing default roles are protected from removal.</div><div className="cw-role-manager">{roles.map(r=><div className="cw-role-manager-row" key={r}><span>{r}</span>{isAdmin&&!DEFAULT_ROLES.includes(r)&&<button className="cw-btn cw-btn-danger cw-btn-small" onClick={async()=>{const next=roles.filter(x=>x!==r);await setDoc(doc(db,"cwSettings","current"),{roles:next,updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null},{merge:true});await audit({title:"CW ROLE REMOVED",message:`${r} was removed from Clan War roles.`,entityType:"cw-role",details:[`Role: ${r}`]})}}>REMOVE</button>}</div>)}</div><div className="cw-role-add"><input value={newRole} onChange={e=>setNewRole(e.target.value)} placeholder="Example: Debuffer / Scout / Coordinator"/><button className="cw-btn cw-btn-primary" onClick={async()=>{const v=clean(newRole);if(!v||roles.some(x=>x.toLowerCase()===v.toLowerCase()))return;await setDoc(doc(db,"cwSettings","current"),{roles:[...roles,v],updatedAt:serverTimestamp(),updatedBy:actor(user),updatedByUid:user?.uid||null},{merge:true});await audit({title:"CW ROLE ADDED",message:`${v} was added to Clan War roles.`,entityType:"cw-role",details:[`Role: ${v}`]});setNewRole("")}}>＋ ADD ROLE</button></div></Modal>}

    {selectedPlayer&&<Modal title="PLAYER HISTORY" wide onClose={()=>setSelectedPlayer(null)}>
      {(() => {
        const playerRows=attendance.filter(r=>String(r.playerId)===String(selectedPlayer.id)).sort((a,b)=>(safeDate(b.scheduledAt||b.updatedAt||b.createdAt)?.getTime()||0)-(safeDate(a.scheduledAt||a.updatedAt||a.createdAt)?.getTime()||0));
        const q=playerHistorySearch.toLowerCase().trim();
        const filtered=playerRows.filter(r=>!q||[r.ign,r.className,r.role,r.receivedItem,r.notes,r.dateKey,r.updatedBy,r.createdBy].some(v=>clean(v).toLowerCase().includes(q)));
        const attendanceRows=filtered;
        const salaryRows=filtered.filter(r=>num(r.salaryGold)>0);
        const itemRows=filtered.filter(r=>clean(r.receivedItem));
        const rows=playerHistoryTab==="salary"?salaryRows:playerHistoryTab==="items"?itemRows:attendanceRows;
        const pageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
        const pageRows=rows.slice((playerHistoryPage-1)*PAGE_SIZE,playerHistoryPage*PAGE_SIZE);
        const stats=statsFor(selectedPlayer);
        const totalItemCost=itemRows.reduce((sum,r)=>sum+num(r.itemCostGold),0);
        return <>
          <div className="cw-history-player-head">
            <div className="cw-history-avatar"><ClassEmblem name={selectedPlayer.className||selectedPlayer.class}/></div>
            <div><div className="cw-kicker">PLAYER HISTORY</div><h3>{selectedPlayer.ign}</h3><p>{selectedPlayer.className||selectedPlayer.class} • {selectedPlayer.role||"Role not set"}</p></div>
          </div>
          <div className="cw-history-stats">
            <div><span className="cw-history-stat-icon">✦</span><div><small>CW DAYS ATTENDED</small><strong>{count(stats.days)}</strong><em>All-time participation</em></div></div>
            <div><span className="cw-history-stat-icon gold">₲</span><div><small>TOTAL SALARY</small><strong className="cw-gold">₲ {money(stats.salary)}</strong><em>Lifetime CW salary</em></div></div>
            <div><span className="cw-history-stat-icon item">◇</span><div><small>ITEMS RECEIVED</small><strong>{count(stats.items)}</strong><em>Recorded item distributions</em></div></div>
            <div><span className="cw-history-stat-icon log">▤</span><div><small>TOTAL LOG ENTRIES</small><strong>{count(playerRows.length)}</strong><em>Attendance history</em></div></div>
          </div>
          <div className="cw-history-toolbar"><input value={playerHistorySearch} onChange={e=>{setPlayerHistorySearch(e.target.value);setPlayerHistoryPage(1)}} placeholder="Search date, role, salary, item, notes..."/><div><small>ACTIVITY LOG</small><b>{count(filtered.length)} ENTRIES</b></div></div>
          <div className="cw-history-tabs">
            <button className={playerHistoryTab==="all"?"active":""} onClick={()=>{setPlayerHistoryTab("all");setPlayerHistoryPage(1)}}>ATTENDANCE</button>
            <button className={playerHistoryTab==="salary"?"active":""} onClick={()=>{setPlayerHistoryTab("salary");setPlayerHistoryPage(1)}}>SALARY HISTORY</button>
            <button className={playerHistoryTab==="items"?"active":""} onClick={()=>{setPlayerHistoryTab("items");setPlayerHistoryPage(1)}}>ITEM RECEIVED HISTORY</button>
          </div>
          <div className="cw-history-summary-strip">
            <div><small>ATTENDANCE RECORDS</small><b>{count(attendanceRows.length)}</b></div>
            <div><small>SALARY RECORDS</small><b>₲ {money(salaryRows.reduce((sum,r)=>sum+num(r.salaryGold),0))}</b></div>
            <div><small>ITEM DISTRIBUTIONS</small><b>{count(itemRows.length)}</b></div>
            <div><small>ITEM COST</small><b>₲ {money(totalItemCost)}</b></div>
          </div>
          {playerHistoryTab==="all"&&<div className="cw-history-table-wrap"><table className="cw-table cw-history-table cw-history-fit-table"><thead><tr><th>DATE / TIME</th><th>CLASS</th><th>ROLE</th><th>SALARY PAID</th><th>ITEM COST</th><th>ITEM RECEIVED</th><th>UPDATED BY</th><th>ACTIONS</th></tr></thead><tbody>
            {pageRows.map(r=><tr key={r.id}><td><strong>{formatDate(r.scheduledAt||r.dateKey,resolvedTimezone)}</strong><small>{formatTime(r.scheduledAt||r.dateKey,resolvedTimezone)}</small></td><td><span className="cw-class"><ClassEmblem name={r.className} small />{r.className}</span></td><td><span className="cw-role">{r.role||"—"}</span></td><td className="cw-gold">₲ {money(r.salaryGold)}</td><td className="cw-gold">₲ {money(r.itemCostGold)}</td><td>{r.receivedItem||"—"}</td><td>{r.updatedBy||r.createdBy||"System"}<small>{formatDateTime(r.updatedAt||r.createdAt,resolvedTimezone)}</small></td><td className="cw-history-actions">{isAdmin&&<button className="cw-btn cw-btn-small" onClick={()=>{setSelectedPlayer(null);openAttendanceRecord(r,"edit")}}>EDIT</button>}{isAdmin&&<button className="cw-btn cw-btn-danger cw-btn-small" onClick={()=>requestDeleteAttendance(r)}>DELETE</button>}</td></tr>)}
            {!pageRows.length&&<tr><td colSpan="8" className="cw-empty">No attendance history found for this player.</td></tr>}
          </tbody></table></div>}
          {playerHistoryTab==="salary"&&<div className="cw-history-table-wrap"><table className="cw-table cw-history-table cw-history-fit-table"><thead><tr><th>CW DATE / TIME</th><th>CLASS</th><th>ROLE</th><th>SALARY PAID</th><th>UPDATED</th><th>UPDATED BY</th><th>ACTIONS</th></tr></thead><tbody>
            {pageRows.map(r=><tr key={r.id}><td><strong>{formatDate(r.scheduledAt||r.dateKey,resolvedTimezone)}</strong><small>{formatTime(r.scheduledAt||r.dateKey,resolvedTimezone)}</small></td><td><span className="cw-class"><ClassEmblem name={r.className} small />{r.className}</span></td><td>{r.role||"—"}</td><td className="cw-gold"><strong>₲ {money(r.salaryGold)}</strong></td><td>{formatDateTime(r.updatedAt||r.createdAt,resolvedTimezone)}</td><td>{r.updatedBy||r.createdBy||"System"}</td><td>{isAdmin&&<button className="cw-btn cw-btn-small" onClick={()=>{setSelectedPlayer(null);openAttendanceRecord(r,"edit")}}>EDIT</button>}</td></tr>)}
            {!pageRows.length&&<tr><td colSpan="7" className="cw-empty">No salary history found.</td></tr>}
          </tbody></table></div>}
          {playerHistoryTab==="items"&&<div className="cw-history-table-wrap"><table className="cw-table cw-history-table cw-history-fit-table"><thead><tr><th>CW DATE / TIME</th><th>ITEM RECEIVED</th><th>ITEM COST</th><th>ROLE</th><th>NOTES</th><th>UPDATED BY</th><th>ACTIONS</th></tr></thead><tbody>
            {pageRows.map(r=><tr key={r.id}><td><strong>{formatDate(r.scheduledAt||r.dateKey,resolvedTimezone)}</strong><small>{formatTime(r.scheduledAt||r.dateKey,resolvedTimezone)}</small></td><td><strong>{r.receivedItem}</strong></td><td className="cw-gold">₲ {money(r.itemCostGold)}</td><td>{r.role||"—"}</td><td title={r.notes||""}>{r.notes||"—"}</td><td>{r.updatedBy||r.createdBy||"System"}<small>{formatDateTime(r.updatedAt||r.createdAt,resolvedTimezone)}</small></td><td>{isAdmin&&<button className="cw-btn cw-btn-small" onClick={()=>{setSelectedPlayer(null);openAttendanceRecord(r,"edit")}}>EDIT</button>}</td></tr>)}
            {!pageRows.length&&<tr><td colSpan="7" className="cw-empty">No item distribution history found.</td></tr>}
          </tbody></table></div>}
          <div className="cw-history-footer"><span>Showing {rows.length?count((playerHistoryPage-1)*PAGE_SIZE+1):0}-{count(Math.min(playerHistoryPage*PAGE_SIZE,rows.length))} of {count(rows.length)} entries</span><div className="cw-pagination"><button disabled={playerHistoryPage<=1} onClick={()=>setPlayerHistoryPage(p=>p-1)}>‹</button><span>{playerHistoryPage} / {pageCount}</span><button disabled={playerHistoryPage>=pageCount} onClick={()=>setPlayerHistoryPage(p=>p+1)}>›</button></div></div>
        </>;
      })()}
    </Modal>}

    {selectedAttendance&&<Modal title="CW ATTENDANCE DETAILS" wide onClose={()=>setSelectedAttendance(null)}><div className="cw-detail-grid"><div><small>PLAYER</small><strong>{selectedAttendance.ign}</strong></div><div><small>CLASS</small><strong><ClassEmblem name={selectedAttendance.className} small />{selectedAttendance.className}</strong></div><div><small>ROLE</small><strong>{selectedAttendance.role}</strong></div><div><small>CW DATE & TIME</small><strong>{formatDateTime(selectedAttendance.scheduledAt||selectedAttendance.dateKey,resolvedTimezone)}</strong></div><div><small>SALARY PAID</small><strong className="cw-gold">₲ {money(selectedAttendance.salaryGold)}</strong></div><div><small>ITEM COST</small><strong className="cw-gold">₲ {money(selectedAttendance.itemCostGold)}</strong></div><div><small>ITEM RECEIVED</small><strong>{selectedAttendance.receivedItem||"—"}</strong></div><div><small>RECORDED BY</small><strong>{selectedAttendance.updatedBy||selectedAttendance.createdBy||"System"}</strong></div><div><small>LAST UPDATED</small><strong>{formatDateTime(selectedAttendance.updatedAt||selectedAttendance.createdAt,resolvedTimezone)}</strong></div></div><div className="cw-detail-block"><small>NOTES</small><p>{selectedAttendance.notes||"No additional notes."}</p></div>{isAdmin&&<div className="cw-modal-actions"><button className="cw-btn" onClick={()=>{const row=selectedAttendance;setSelectedAttendance(null);openAttendanceRecord(row,"edit")}}>EDIT</button><button className="cw-btn cw-btn-primary" onClick={()=>{const row=selectedAttendance;setSelectedAttendance(null);openAttendanceRecord(row,"override")}}>OVERRIDE</button><button className="cw-btn cw-btn-danger" onClick={()=>requestDeleteAttendance(selectedAttendance)}>DELETE RECORD</button></div>}</Modal>}

    {treasuryModal==="entry"&&<Modal title="ADD TREASURY ENTRY" wide onClose={()=>setTreasuryModal(null)}><div className="cw-form-grid"><label>TYPE<select value={treasuryForm.type} onChange={e=>setTreasuryForm({...treasuryForm,type:e.target.value})}><option value="cw-war-income">RECEIVED FROM CW WAR (+)</option><option value="expense">EXPENSE (-)</option></select></label><label>AMOUNT (GOLD)<input inputMode="decimal" value={treasuryForm.amount} onChange={e=>setTreasuryForm({...treasuryForm,amount:formatMoneyInput(e.target.value)})} placeholder="0"/></label><label>{treasuryForm.type==="cw-war-income"?"DATE & TIME RECEIVED":"DATE & TIME OF EXPENSE"}<input type="datetime-local" value={treasuryForm.transactionAt||""} onChange={e=>setTreasuryForm({...treasuryForm,transactionAt:e.target.value})}/><small className="cw-field-help">Choose the date/time in <b>{resolvedTimezone}</b>. Displays as 12-hour AM/PM with the selected timezone.</small></label><label className="cw-span-2">DESCRIPTION<input value={treasuryForm.description} onChange={e=>setTreasuryForm({...treasuryForm,description:e.target.value})} placeholder="Example: CW War winnings / Guild expense"/></label><label className="cw-span-2">ITEM / WHAT WAS PURCHASED<textarea value={treasuryForm.item} onChange={e=>setTreasuryForm({...treasuryForm,item:e.target.value})} placeholder="Optional: PUM BOX • Crazytime Box • Guild supplies"/></label><label className="cw-span-2">ADMIN COMMENT<textarea value={treasuryForm.adminComment} onChange={e=>setTreasuryForm({...treasuryForm,adminComment:e.target.value})} placeholder="Explain what this money was for..."/></label></div><div className="cw-modal-actions"><button className="cw-btn" onClick={()=>setTreasuryModal(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveTreasuryEntry}>{saving?"SAVING...":"SAVE TREASURY ENTRY"}</button></div></Modal>}

    {treasuryModal==="edit"&&<Modal title={treasuryEditOriginal?.type==="balance-override"?"EDIT BALANCE OVERRIDE":"EDIT TREASURY ENTRY"} wide onClose={()=>{setTreasuryModal(null);setTreasuryEditOriginal(null)}}>
      {treasuryEditOriginal?.type==="balance-override"?<div className="cw-form-grid"><label>CURRENT AVAILABLE<strong className={`cw-modal-value ${treasuryBalance<0?"cw-negative-text":"cw-gold"}`}>₲ {money(treasuryBalance)}</strong></label><label>NEW AVAILABLE GOLD<input inputMode="decimal" value={treasuryForm.amount} onChange={e=>setTreasuryForm({...treasuryForm,amount:formatMoneyInput(e.target.value)})} placeholder="0.00"/></label><label className="cw-span-2">WHY IS THIS BEING EDITED? *<textarea value={treasuryForm.adminComment} onChange={e=>setTreasuryForm({...treasuryForm,adminComment:e.target.value})} placeholder="Required. Explain the correction..."/></label></div>:
      <div className="cw-form-grid"><label>TYPE<select value={treasuryForm.type} disabled={Boolean(treasuryEditOriginal?.sourceAttendanceId)} onChange={e=>setTreasuryForm({...treasuryForm,type:e.target.value})}><option value="cw-war-income">RECEIVED FROM CW WAR (+)</option><option value="expense">EXPENSE (-)</option></select></label><label>AMOUNT (GOLD)<input inputMode="decimal" value={treasuryForm.amount} onChange={e=>setTreasuryForm({...treasuryForm,amount:formatMoneyInput(e.target.value)})} placeholder="0"/></label><label>{treasuryForm.type==="cw-war-income"?"DATE & TIME RECEIVED":"DATE & TIME OF EXPENSE"}<input type="datetime-local" value={treasuryForm.transactionAt||""} onChange={e=>setTreasuryForm({...treasuryForm,transactionAt:e.target.value})}/><small className="cw-field-help">Choose the date/time in <b>{resolvedTimezone}</b>. Displays as 12-hour AM/PM with the selected timezone.</small></label><label className="cw-span-2">DESCRIPTION<input value={treasuryForm.description} onChange={e=>setTreasuryForm({...treasuryForm,description:e.target.value})}/></label><label className="cw-span-2">ITEM / WHAT WAS PURCHASED<textarea value={treasuryForm.item} onChange={e=>setTreasuryForm({...treasuryForm,item:e.target.value})}/></label><label className="cw-span-2">WHY WAS THIS EDITED? *<textarea value={treasuryForm.adminComment} onChange={e=>setTreasuryForm({...treasuryForm,adminComment:e.target.value})} placeholder="Required. Explain exactly why the amount, description or item was corrected..."/></label></div>}
      <div className="cw-helper">{treasuryEditOriginal?.sourceAttendanceId?"This Treasury row is linked to CW attendance. Editing the salary/item amount here updates the CW attendance record and the Treasury ledger together.":treasuryEditOriginal?.type==="balance-override"?"The new balance is stored as a correction delta. The previous balance and reason remain in the audit trail.":"The original value is kept in the Guild Notice Board. Editing changes the current Guild Gold balance, so a reason is required."}</div>
      <div className="cw-modal-actions"><button className="cw-btn" onClick={()=>{setTreasuryModal(null);setTreasuryEditOriginal(null)}}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveTreasuryEdit}>{saving?"SAVING...":"SAVE EDIT & LOG REASON"}</button></div>
    </Modal>}

    {treasuryModal==="override"&&<Modal title="OVERRIDE AVAILABLE GUILD GOLD" wide onClose={()=>setTreasuryModal(null)}><div className="cw-form-grid"><label>CURRENT AVAILABLE<strong className={`cw-modal-value ${treasuryBalance<0?"cw-negative-text":"cw-gold"}`}>₲ {money(treasuryBalance)}</strong></label><label>NEW AVAILABLE GOLD<input inputMode="decimal" value={treasuryForm.amount} onChange={e=>setTreasuryForm({...treasuryForm,amount:formatMoneyInput(e.target.value)})} placeholder="0.00"/></label><label className="cw-span-2">WHY IS THE BALANCE BEING OVERRIDDEN? *<textarea value={treasuryForm.adminComment} onChange={e=>setTreasuryForm({...treasuryForm,adminComment:e.target.value})} placeholder="Required. Example: Guild vault was counted manually and does not match the ledger."/></label></div><div className="cw-helper"><b>This does not erase history.</b> The system records only the difference between the current ledger balance and the new balance, along with your reason, date and account. Future Treasury activity continues from the corrected balance.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={()=>setTreasuryModal(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={saveTreasuryOverride}>{saving?"SAVING...":"OVERRIDE & LOG BALANCE"}</button></div></Modal>}

    {adminConfirm&&<Modal title={adminConfirm.title} wide onClose={()=>setAdminConfirm(null)}><div className="cw-confirm-warning"><strong>ADMIN ACTION WILL BE LOGGED</strong><p>{adminConfirm.message}</p></div><label>ADMIN COMMENT *<textarea autoFocus value={adminConfirm.comment} onChange={e=>setAdminConfirm({...adminConfirm,comment:e.target.value})} placeholder="Explain why you are making this change..."/></label><div className="cw-helper">This comment is stored in the Guild Notice Board with the action, changed record and administrator.</div><div className="cw-modal-actions"><button className="cw-btn" onClick={()=>setAdminConfirm(null)}>CANCEL</button><button className="cw-btn cw-btn-primary" disabled={saving} onClick={runAdminAction}>CONFIRM & LOG</button></div></Modal>}

    {auditDetail&&<Modal title="ACTIVITY DETAILS" wide onClose={()=>setAuditDetail(null)}><div className="cw-detail-grid"><div><small>ACTION</small><strong>{auditDetail.title||"Activity"}</strong></div><div><small>CREATED BY</small><strong>{auditDetail.createdBy||"System"}</strong></div><div><small>DATE & TIME</small><strong>{formatDateTime(auditDetail.createdAt||auditDetail.timestamp,resolvedTimezone)}</strong></div><div><small>MODULE</small><strong>{auditDetail.module==="treasury"?"TREASURY":"CLAN WAR"}</strong></div></div><div className="cw-detail-block"><small>DETAILS</small><p>{auditDetail.message||"—"}</p></div>{Array.isArray(auditDetail.details)&&auditDetail.details.length>0&&<div className="cw-detail-block"><small>RECORD</small><ul>{auditDetail.details.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}{Array.isArray(auditDetail.changes)&&auditDetail.changes.length>0&&<div className="cw-detail-block"><small>CHANGES</small><div className="cw-change-list">{auditDetail.changes.map((x,i)=><div key={i}><b>{x.field}</b><span>{x.from||"—"} → {x.to||"—"}</span></div>)}</div></div>}</Modal>}

    {allNotices&&<Modal title="ALL CW + TREASURY NOTIFICATIONS" wide onClose={()=>setAllNotices(false)}><div className="cw-filter-row one"><input value={noticeSearch} onChange={e=>setNoticeSearch(e.target.value)} placeholder="Search all notifications..."/></div><div className="cw-all-notice-list">{notices.map(n=><NoticeItem key={n.id} item={n} timezone={resolvedTimezone} onClick={setAuditDetail}/>)}</div>{!notices.length&&<div className="cw-empty">No notifications found.</div>}</Modal>}
  </div>;
}
