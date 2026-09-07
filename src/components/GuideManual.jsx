import React, { useContext } from "react";

const GuideFilterContext = React.createContext(() => true);

function GuideMockScreen({ title, subtitle, rows = [], highlight = "", image = null }) {
  return (
    <div className="guide-mock-screen">
      <div className="guide-mock-topbar">
        <span className="guide-mock-dot" />
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      {image ? <img className="guide-mock-image" src={image} alt="Instructional application reference" /> : null}
      <div className="guide-mock-controls">
        <span>SEARCH</span><span>FILTER</span><span>DATE</span><span>SORT</span>
      </div>
      <div className="guide-mock-table">
        <div className="guide-mock-head"><span>DATE / TIME</span><span>RECORD</span><span>STATUS</span></div>
        {(rows.length ? rows : [
          ["2026-09-06 18:42", "Latest record", "ACTIVE"],
          ["2026-09-06 17:31", "Previous record", "ACTIVE"],
          ["2026-09-05 22:18", "Older record", "OLD"],
        ]).map((row, i) => (
          <div className={`guide-mock-row ${highlight && row[1].includes(highlight) ? "focus" : ""}`} key={i}>
            <span>{row[0]}</span><span>{row[1]}</span><span>{row[2]}</span>
          </div>
        ))}
      </div>
      <div className="guide-mock-pointer">① LOOK HERE</div>
    </div>
  );
}

function GuideNavMap({ admin = false }) {
  const items = admin
    ? ["RAID SCHEDULE", "BH ATTENDANCE", "CW ATTENDANCE", "GUILD QUESTIONS", "ADMIN"]
    : ["RAID SCHEDULE", "BH ATTENDANCE", "CW ATTENDANCE", "GUILD QUESTIONS", "GUIDE"];
  return (
    <div className="guide-nav-map">
      <div className="guide-nav-brand">RAN ONLINE <small>EP7 CLASSIC</small></div>
      {items.map((item, i) => <div className="guide-nav-item" key={item}><b>{String(i + 1).padStart(2, "0")}</b><span>{item}</span><em>{i === 0 ? "WORLD BOSS TIMER" : i === 1 ? "PLAYERS & REWARDS" : i === 2 ? "CASTLE WAR RECORDS" : i === 3 ? "GUIDES & INFO" : admin ? "SYSTEM CONTROL" : "OPEN THIS MANUAL"}</em></div>)}
      <div className="guide-nav-item guide-nav-time"><b>◎</b><span>DISPLAY TIMEZONE</span><em>Changes how displayed dates/times are shown</em></div>
    </div>
  );
}

function GuideFilterDemo() {
  return (
    <div className="guide-demo-card">
      <div className="guide-demo-label">EXAMPLE — FIND ONE PLAYER</div>
      <div className="guide-demo-fields"><span>PLAYER ▼</span><span>DATE ▼</span><span>STATUS ▼</span><button>CLEAR</button></div>
      <div className="guide-demo-arrow">↓ ① CHOOSE THE PLAYER YOU WANT</div>
      <div className="guide-demo-result"><b>REAPER</b><span>3 matching records</span><strong>FILTERED</strong></div>
      <div className="guide-demo-arrow">↓ ② CHECK THE RESULT BEFORE EDITING</div>
    </div>
  );
}

function GuideSortDemo() {
  return (
    <div className="guide-sort-demo">
      <div className="guide-demo-label">DEFAULT HISTORY ORDER</div>
      {["2026-09-06 18:42 — NEWEST", "2026-09-06 17:31", "2026-09-05 22:18", "2026-09-04 19:04 — OLDEST SHOWN"].map((text, i) => <div key={text} className={i === 0 ? "latest" : ""}><b>{i + 1}</b><span>{text}</span>{i === 0 && <em>START HERE</em>}</div>)}
    </div>
  );
}

function GuideStep({ number, title, children, note, danger = false }) {
  return (
    <div className={`guide-step-card ${danger ? "danger" : ""}`}>
      <div className="guide-step-number">{number}</div>
      <div>
        <h4>{title}</h4>
        <div className="guide-step-body">{children}</div>
        {note ? <div className="guide-step-note">{note}</div> : null}
      </div>
    </div>
  );
}

function GuidePath({ children }) {
  return <div className="guide-path"><span>YOU ARE HERE</span>{children}</div>;
}

function GuideSection({ number, title, kicker, children, visual = null, warning = false, categories = [] }) {
  const allowed = useContext(GuideFilterContext);
  if (!allowed(categories)) return null;
  return (
    <section className={`guide-big-section guide-section-enhanced ${warning ? "guide-warning-section" : ""}`}>
      <div className="guide-number">{number}</div>
      <div className="guide-content">
        <div className="guide-kicker guide-section-kicker-enhanced">{kicker || "STEP-BY-STEP"}</div>
        <div className="guide-title">{title}</div>
        {children}
        {visual}
      </div>
    </section>
  );
}

function GuideVisual({ label, text, image, children }) {
  return (
    <div className="guide-visual-panel">
      {image ? <img src={image} alt="Guide reference" /> : children}
      <strong>{label}</strong>
      <small>{text}</small>
    </div>
  );
}

function UserGuide({ images, filter }) {
  const allowed = (categories) => filter === "ALL" || categories.includes(filter);
  const { heroGuideImage, bhGuideImage, guildWarGuideImage, ranVIcon } = images;
  return (
    <GuideFilterContext.Provider value={allowed}>
      <>
    <GuideSection number="01" title="START HERE — YOUR FIRST 5 MINUTES" categories={["START HERE"]} kicker="BEGINNER START">
      <p className="guide-lead">You do not need to understand the whole website. Follow these steps once. After that, use the individual sections below whenever you forget where something is.</p>
      <GuidePath>Dashboard → <b>GUIDE</b> → START HERE</GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Look at the top navigation">Find <b>RAID SCHEDULE</b>, <b>BH ATTENDANCE</b>, <b>CW ATTENDANCE</b>, and <b>GUILD QUESTIONS</b>. These are the main areas you will use.</GuideStep>
        <GuideStep number="2" title="Check your access">If you are signed in as a regular member, your header shows <b>USER</b>. That means you can view permitted information but protected records are not yours to change.</GuideStep>
        <GuideStep number="3" title="Set your display timezone">Use <b>DISPLAY TIMEZONE</b> in the header. If a time looks wrong, check this first before reporting a problem.</GuideStep>
        <GuideStep number="4" title="Start with the page you need">Boss schedule → RAID. Boss Hunt records → BH. Clan War records → CW. Report a problem → GUILD QUESTIONS.</GuideStep>
        <GuideStep number="5" title="If you are unsure, stop">Do not guess, create another record, or try to work around a protected control. Use this GUIDE or submit a detailed Guild Question.</GuideStep>
      </div>
      <GuideNavMap />
    </GuideSection>

    <GuideSection number="02" title="UNDERSTAND THE SCREEN BEFORE YOU CLICK" categories={["NAVIGATION"]} kicker="NAVIGATION">
      <p className="guide-lead">Think of the website as four main rooms. The navigation buttons move you between rooms; the tabs and filters inside each room narrow down what you are looking at.</p>
      <GuideNavMap />
      <div className="guide-three-column">
        <div><b>RAID</b><span>Upcoming boss times, countdowns, and schedule information.</span></div>
        <div><b>BH</b><span>Boss Hunt attendance, players, points, rewards, history, and activity.</span></div>
        <div><b>CW</b><span>Clan War calendar, attendance, salary, items, Treasury, and history.</span></div>
      </div>
      <div className="guide-tip-box"><b>TIP:</b> When an instruction says “open BH,” click <b>BH ATTENDANCE</b> in the top navigation. When it says “open the history,” use the relevant <b>PLAYERS & HISTORY</b> or player history area inside that page.</div>
    </GuideSection>

    <GuideSection number="03" title="RAID SCHEDULE — FIND THE NEXT BOSS" categories={["RAID"]} kicker="RAID">
      <GuidePath>Dashboard → <b>RAID SCHEDULE</b></GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Open RAID SCHEDULE">Click <b>RAID SCHEDULE</b> at the top of the website.</GuideStep>
        <GuideStep number="2" title="Check DISPLAY TIMEZONE">Read the timezone selector before comparing the displayed time with your local clock. The same event can display a different clock time in another timezone.</GuideStep>
        <GuideStep number="3" title="Read the boss card">Find the boss name, next occurrence, date/time, recurrence, and countdown.</GuideStep>
        <GuideStep number="4" title="Do not confuse the next occurrence with an older one">If you are checking whether a boss is coming up, use the next occurrence/countdown. If you are investigating an old event, use the history or date information available on the page.</GuideStep>
      </div>
      <GuideMockScreen title="RAID SCHEDULE" subtitle="Next boss occurrence" image={heroGuideImage} />
      <div className="guide-mistakes"><b>REGULAR USER:</b> Schedule data is protected. If a scheduled time appears incorrect, report the boss, date/time, and timezone rather than trying to edit it.</div>
    </GuideSection>

    <GuideSection number="04" title="BH — FIND YOUR BOSS HUNT RECORDS" categories={["BH"]} kicker="BOSS HUNT" visual={<GuideVisual label="BH REFERENCE" text="Use the real page controls; this picture is a visual reminder of where to look." image={bhGuideImage} />}>
      <GuidePath>Dashboard → <b>BH ATTENDANCE</b></GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Open BH ATTENDANCE">Click the <b>BH ATTENDANCE</b> button.</GuideStep>
        <GuideStep number="2" title="Find PLAYERS & HISTORY">Look for the player/history area. This is where permitted player information and attendance history can be reviewed.</GuideStep>
        <GuideStep number="3" title="Use the filters">If there are many records, filter by player, class, date, boss, or the controls actually shown on your current page.</GuideStep>
        <GuideStep number="4" title="Read the record">Check the player, boss/occurrence, date/time, attendance status, points, and any reward information shown.</GuideStep>
        <GuideStep number="5" title="Check activity when investigating a change">Open <b>ACTIVITY & NOTIFICATIONS</b> and select an entry when you need the full details.</GuideStep>
      </div>
      <GuideFilterDemo />
      <div className="guide-stop-box"><b>STOP:</b> If your attendance or points are wrong, do not add another attendance/points entry to “balance it out.” Report the exact player, event, date, and expected result in <b>GUILD QUESTIONS</b>.</div>
    </GuideSection>

    <GuideSection number="05" title="CW — FIND YOUR CLAN WAR RECORDS" categories={["CW"]} kicker="CLAN WAR" visual={<GuideVisual label="CW REFERENCE" text="Use the calendar/record controls on the live page." image={guildWarGuideImage} />}>
      <GuidePath>Dashboard → <b>CW ATTENDANCE</b></GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Open CW ATTENDANCE">Click the Clan War navigation button.</GuideStep>
        <GuideStep number="2" title="Choose the correct calendar day">Use the page's date/calendar controls to reach the Clan War occurrence you want. Verify the actual date before reading the record.</GuideStep>
        <GuideStep number="3" title="Review your information">Check attendance, salary, role, item history, or other information permitted for your account.</GuideStep>
        <GuideStep number="4" title="Remember that dates and times matter">A record from yesterday is not the same record as today's war. Check the displayed date/time before reporting an issue.</GuideStep>
      </div>
      <GuideSortDemo />
      <div className="guide-tip-box"><b>IMPORTANT:</b> History/activity tables are intended to show the newest datetime first. Start at the top when looking for the most recent record.</div>
    </GuideSection>

    <GuideSection number="06" title="FILTERS — HOW TO FIND ONE RECORD" categories={["FILTERS"]} kicker="SEARCH & FILTERS">
      <p className="guide-lead">A filter does not change or delete data. It temporarily hides records that do not match your selection so you can find what you need.</p>
      <GuideFilterDemo />
      <div className="guide-step-stack">
        <GuideStep number="1" title="Find the filter row">Look directly above the table for dropdowns, search boxes, date controls, or filter buttons.</GuideStep>
        <GuideStep number="2" title="Use the most specific filter first">If you know the player, choose the player. If you know the event date, use the date. If you know both, use both.</GuideStep>
        <GuideStep number="3" title="Check how many results remain">Make sure the filtered result actually matches the person/event you wanted.</GuideStep>
        <GuideStep number="4" title="Clear the filter when finished">Use <b>CLEAR</b>, <b>RESET</b>, or the page's equivalent control before starting a different search.</GuideStep>
      </div>
      <div className="guide-warning-inline"><b>COMMON MISTAKE:</b> “My record is missing” can simply mean a filter is still active. Clear all filters and check again before reporting missing data.</div>
    </GuideSection>

    <GuideSection number="07" title="SORTING & DATES — ALWAYS CHECK THE TIMESTAMP" categories={["HISTORY"]} kicker="HISTORY">
      <GuideSortDemo />
      <div className="guide-step-stack">
        <GuideStep number="1" title="Start at the top">History/activity tables are designed to put the latest datetime first. The first row is normally the newest visible record.</GuideStep>
        <GuideStep number="2" title="Read both date and time">Do not rely on the date alone when multiple events happened on the same day.</GuideStep>
        <GuideStep number="3" title="Check the display timezone">A timestamp is displayed using the selected global timezone. Verify that selector before comparing times.</GuideStep>
        <GuideStep number="4" title="If you changed a filter, verify again">Filtering may change which records are visible, but the table should still present the relevant records in the intended latest-first order.</GuideStep>
      </div>
    </GuideSection>

    <GuideSection number="08" title="GUILD QUESTIONS — REPORT A PROBLEM SO AN ADMIN CAN FIX IT" categories={["TICKETS","HELP"]} kicker="HELP / TICKETS">
      <GuidePath>Dashboard → <b>GUILD QUESTIONS</b></GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Open GUILD QUESTIONS">Click the question-mark navigation button.</GuideStep>
        <GuideStep number="2" title="Choose the correct category">Use the structured category that best matches the issue, such as BH ATTENDANCE, CW ATTENDANCE, SALARY, REWARDS, TREASURY, ITEM / INVENTORY, SCHEDULE, PLAYER / ACCOUNT, or CONCERN / COMPLAINT.</GuideStep>
        <GuideStep number="3" title="Choose the issue type">Pick the most specific issue type available.</GuideStep>
        <GuideStep number="4" title="Describe the problem completely">Include player name, event/boss/war, date, approximate time, what you see, and what you expected.</GuideStep>
        <GuideStep number="5" title="Submit and wait for investigation">The administrator should inspect the real underlying record before making a correction.</GuideStep>
      </div>
      <div className="guide-report-good"><b>GOOD REPORT</b><p>“BH attendance missing for REAPER on Sep 5, Sonya spawn. I expected PRESENT. Display timezone is Pacific.”</p></div>
      <div className="guide-report-bad"><b>BAD REPORT</b><p>“Fix this.”</p><small>No player, date, event, or expected result.</small></div>
    </GuideSection>

    <GuideSection number="09" title="YOUR ACCESS — WHAT USERS CAN AND CANNOT DO" categories={["YOUR ACCESS"]} kicker="PERMISSIONS">
      <div className="guide-permission-grid">
        <div className="can"><b>YOU CAN</b><ul><li>Browse schedules.</li><li>Use filters and search controls.</li><li>Review permitted BH/CW records.</li><li>Review your available history.</li><li>Open the GUIDE.</li><li>Submit Guild Questions.</li></ul></div>
        <div className="cannot"><b>YOU CANNOT</b><ul><li>Add/edit/remove protected attendance.</li><li>Change points or balances.</li><li>Manage players.</li><li>Assign protected rewards/items.</li><li>Change Treasury records.</li><li>Change administrator/security settings.</li></ul></div>
      </div>
      <div className="guide-visual-small"><img src={ranVIcon} alt="User access" /><div><b>USER</b><span>USER does not mean administrator. Protected controls remain unavailable.</span></div></div>
    </GuideSection>

    <GuideSection number="10" title="IF SOMETHING DOES NOT LOOK RIGHT" categories={["HELP"]} kicker="TROUBLESHOOTING">
      <div className="guide-decision-tree">
        <div><b>1</b><span>Is the page loaded?</span></div><i>↓</i><div><b>2</b><span>Clear filters and verify DISPLAY TIMEZONE.</span></div><i>↓</i><div><b>3</b><span>Check the player + date + event.</span></div><i>↓</i><div><b>4</b><span>If still wrong, submit GUILD QUESTIONS with details.</span></div>
      </div>
      <div className="guide-step-stack">
        <GuideStep number="A" title="Do not create a duplicate to fix a missing-looking record">First clear filters and verify the occurrence.</GuideStep>
        <GuideStep number="B" title="Do not change protected records">A disabled/hidden control is expected for a regular user.</GuideStep>
        <GuideStep number="C" title="Give the administrator enough information">Player + event + date/time + current result + expected result is the fastest useful report.</GuideStep>
      </div>
    </GuideSection>

    <GuideSection number="11" title="QUICK REFERENCE — WHICH BUTTON DO I USE?" categories={["HELP"]} kicker="CHEAT SHEET">
      <div className="guide-quick-grid">
        <div><b>I WANT TO...</b><span>See the next boss</span><strong>RAID SCHEDULE</strong></div>
        <div><b>I WANT TO...</b><span>See Boss Hunt records</span><strong>BH ATTENDANCE</strong></div>
        <div><b>I WANT TO...</b><span>See Clan War records</span><strong>CW ATTENDANCE</strong></div>
        <div><b>I WANT TO...</b><span>Report a problem</span><strong>GUILD QUESTIONS</strong></div>
        <div><b>I WANT TO...</b><span>Learn how something works</span><strong>GUIDE</strong></div>
        <div><b>I WANT TO...</b><span>Find a recent change</span><strong>ACTIVITY / HISTORY</strong></div>
      </div>
    </GuideSection>

    <div className="guide-final-check"><b>USER FINAL RULE:</b> View → Filter → Verify → Report. Do not guess, duplicate, or bypass protected controls.</div>
      </>
    </GuideFilterContext.Provider>
  );
}

function AdminGuide({ images, filter }) {
  const allowed = (categories) => filter === "ALL" || categories.includes(filter);
  const { heroGuideImage, bhGuideImage, guildWarGuideImage, ranVIcon } = images;
  return (
    <GuideFilterContext.Provider value={allowed}>
      <>
    <GuideSection number="01" title="FIRST LOGIN — LEARN THE ADMIN SCREEN BEFORE CHANGING ANYTHING" categories={["START HERE"]} kicker="START HERE">
      <p className="guide-lead">This section assumes you have never been an administrator before. Your first goal is not to edit data. Your first goal is to learn where everything is and how to verify a change.</p>
      <GuidePath>Sign in → confirm <b>ADMIN</b> → click <b>GUIDE</b></GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Sign in">Click <b>ADMIN LOGIN</b>, enter the administrator email/password, and sign in.</GuideStep>
        <GuideStep number="2" title="Confirm ADMIN access">The header should show <b>ADMIN</b>. If you only see USER, do not attempt protected changes.</GuideStep>
        <GuideStep number="3" title="Learn the five main areas">RAID SCHEDULE, BH ATTENDANCE, CW ATTENDANCE, GUILD QUESTIONS, and ADMINISTRATOR PORTAL.</GuideStep>
        <GuideStep number="4" title="Do a read-only tour first">Open each area and look around. Do not change records until you know how to identify the correct date, player, and record.</GuideStep>
      </div>
      <div className="guide-visual-small admin"><img src={ranVIcon} alt="Administrator access" /><div><b>ADMIN ACCESS</b><span>Protected controls are available only while the account is an active authenticated administrator.</span></div></div>
    </GuideSection>

    <GuideSection number="02" title="ADMIN NAVIGATION — KNOW WHERE THE WORK BELONGS" categories={["NAVIGATION"]} kicker="NAVIGATION">
      <GuideNavMap admin />
      <div className="guide-three-column">
        <div><b>RAID</b><span>Schedule/timing verification and schedule editing when needed.</span></div>
        <div><b>BH</b><span>Attendance, players, points, rewards, history, and audit activity.</span></div>
        <div><b>CW</b><span>Attendance, salary, items, Treasury, player history, and activity.</span></div>
      </div>
      <div className="guide-tip-box"><b>ADMIN RULE:</b> Every protected correction should end with verification of the resulting record and the activity/audit entry when applicable.</div>
    </GuideSection>

    <GuideSection number="03" title="RAID SCHEDULE — CHECK BEFORE YOU EDIT" categories={["RAID"]} kicker="RAID" visual={<GuideVisual label="RAID REFERENCE" text="Verify boss, date, time, timezone, and recurrence." image={heroGuideImage} />}>
      <GuidePath>RAID SCHEDULE → locate boss → verify → edit → verify again</GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Find the boss">Identify the exact boss/raid occurrence you need to correct.</GuideStep>
        <GuideStep number="2" title="Check DISPLAY TIMEZONE">Make sure the displayed date/time is understood before changing anything.</GuideStep>
        <GuideStep number="3" title="Confirm recurrence">Determine whether the record is weekly, daily, interval-based, or another schedule type shown by the application.</GuideStep>
        <GuideStep number="4" title="Change only what is wrong">Correct the existing schedule rather than creating a second schedule for the same event.</GuideStep>
        <GuideStep number="5" title="Verify after save">Return to the schedule, confirm the new occurrence, and inspect activity/notifications if available.</GuideStep>
      </div>
      <div className="guide-warning-inline"><b>DO NOT:</b> create duplicate schedules because the displayed time looked wrong in another timezone.</div>
    </GuideSection>

    <GuideSection number="04" title="BH — ATTENDANCE, PLAYERS, POINTS, REWARDS & ACTIVITY" categories={["BH"]} kicker="BOSS HUNT" visual={<GuideVisual label="BH REFERENCE" text="Use ACTUAL SCHEDULE first, then player/history, then rewards/activity." image={bhGuideImage} />}>
      <GuidePath>BH ATTENDANCE → ACTUAL SCHEDULE → PLAYER → SAVE → VERIFY</GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Choose the exact Boss Hunt occurrence">Start with <b>ACTUAL SCHEDULE</b>. Confirm boss, date, and spawn before selecting a player.</GuideStep>
        <GuideStep number="2" title="Select the correct player">Compare IGN/class with the roster. Do not rely on a partial name if another player could be similar.</GuideStep>
        <GuideStep number="3" title="Record attendance">Use the protected administrator control. Review player + occurrence + attendance status immediately before saving.</GuideStep>
        <GuideStep number="4" title="Verify points/history">Open the relevant player/history view and confirm the resulting attendance and balance/points are correct.</GuideStep>
        <GuideStep number="5" title="Handle rewards separately and carefully">Confirm reward owner, boss/reward type, quantity, and any claim/inventory information before saving a correction.</GuideStep>
        <GuideStep number="6" title="Inspect ACTIVITY & NOTIFICATIONS">Find the newest entry and open it for full details when a protected change should be audited.</GuideStep>
      </div>
      <GuideFilterDemo />
      <div className="guide-stop-box"><b>CORRECTION RULE:</b> Fix the original source record. Do not add a second compensating attendance, points, reward, or inventory record unless the application workflow specifically requires a separate transaction.</div>
    </GuideSection>

    <GuideSection number="05" title="BH BULK OPERATIONS — VERIFY BEFORE AND AFTER" categories={["BH"]} kicker="BULK TOOLS">
      <p className="guide-lead">Bulk tools are powerful because one action can affect multiple players. Treat every bulk save as a high-attention operation.</p>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Choose the exact event/date first">Never start by selecting a large group of players. Start by identifying the correct Boss Hunt occurrence.</GuideStep>
        <GuideStep number="2" title="Review the selected player list">Confirm every selected player belongs in the operation. Remove anyone who should not be affected.</GuideStep>
        <GuideStep number="3" title="Confirm the attendance/status">Make sure the status and point effect are what you intend.</GuideStep>
        <GuideStep number="4" title="Save once">Do not repeatedly click Save because the page appears slow. Wait for the operation to finish.</GuideStep>
        <GuideStep number="5" title="Verify the results">Filter the resulting records and confirm the expected players received the expected change.</GuideStep>
        <GuideStep number="6" title="Check activity">Use the activity feed to confirm the protected operation was recorded.</GuideStep>
      </div>
      <div className="guide-warning-inline"><b>NO DUPLICATES:</b> Before repeating a bulk operation, verify whether the intended records already exist. Never use a second bulk save just because you are unsure whether the first one completed.</div>
    </GuideSection>

    <GuideSection number="06" title="CW — ATTENDANCE, SALARY, ITEMS & TREASURY" categories={["CW"]} kicker="CLAN WAR" visual={<GuideVisual label="CW REFERENCE" text="Verify the correct war/date before financial or item changes." image={guildWarGuideImage} />}>
      <GuidePath>CW ATTENDANCE → correct war → player → save → history/Treasury/activity</GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Choose the correct Clan War occurrence">Use the calendar/day controls. Confirm the exact date and displayed time.</GuideStep>
        <GuideStep number="2" title="Record or correct attendance">Select the player, class/role information as applicable, verify the occurrence, then save.</GuideStep>
        <GuideStep number="3" title="Verify salary">Check the salary/history result after attendance or salary changes. Make corrections against the original record.</GuideStep>
        <GuideStep number="4" title="Assign an item carefully">In the Treasury/item workflow, verify item name, quantity, cost, player/owner, and the relevant war before saving.</GuideStep>
        <GuideStep number="5" title="Review Treasury">Income, salary/outflow, expenses, and balance should make sense together. Use the transaction timestamp and description to identify the exact entry.</GuideStep>
        <GuideStep number="6" title="Verify activity">Check the unified activity feed for attendance, salary, item, owner, and Treasury changes.</GuideStep>
      </div>
      <div className="guide-tip-box"><b>QUANTITY:</b> Do not assume an item quantity must be 10 or another fixed number. Enter the quantity actually intended by the transaction.</div>
    </GuideSection>

    <GuideSection number="07" title="CW BULK ATTENDANCE — SAFE PROCEDURE" categories={["CW"]} kicker="BULK TOOLS">
      <div className="guide-step-stack">
        <GuideStep number="1" title="Select the correct date/war">Verify the calendar first.</GuideStep>
        <GuideStep number="2" title="Select only intended players">Review the complete selection before saving.</GuideStep>
        <GuideStep number="3" title="Confirm role/status/pay effect">Know what the bulk action will write to each selected record.</GuideStep>
        <GuideStep number="4" title="Save once and wait">Do not click multiple times.</GuideStep>
        <GuideStep number="5" title="Filter and verify">Immediately search for a few expected records and confirm the resulting attendance/salary/history.</GuideStep>
        <GuideStep number="6" title="Check activity">Newest activity should be at the top. Confirm the action is represented as expected.</GuideStep>
      </div>
      <GuideSortDemo />
    </GuideSection>

    <GuideSection number="08" title="GUILD QUESTIONS — ADMIN INVESTIGATION WORKFLOW" categories={["TICKETS"]} kicker="TICKETS">
      <GuidePath>GUILD QUESTIONS → read → filter → investigate source record → correct → verify → respond</GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Read the ticket completely">Read subject, description, category, issue type, player, and dates before changing anything.</GuideStep>
        <GuideStep number="2" title="Use the structured category">Do not infer the category from the subject alone. Use the actual category/issue fields.</GuideStep>
        <GuideStep number="3" title="Find the source record">If the ticket says attendance is missing, inspect attendance/history. If it says salary is wrong, inspect the salary record. If it says item is wrong, inspect item/Treasury history.</GuideStep>
        <GuideStep number="4" title="Make one targeted correction">Correct the underlying record instead of creating a duplicate compensation record.</GuideStep>
        <GuideStep number="5" title="Verify balances/history">Check the affected player and related ledger/history after saving.</GuideStep>
        <GuideStep number="6" title="Leave a clear communication trail">Your response should explain what was checked and what was corrected so another admin can understand the outcome.</GuideStep>
      </div>
    </GuideSection>

    <GuideSection number="09" title="ADMIN PORTAL — EVERY TAB EXPLAINED" categories={["ADMIN"]} kicker="ADMIN">
      <div className="guide-admin-tab-grid">
        <div><b>OVERVIEW</b><span>Start here for a quick status summary, active administrators, recovery archives, and security state.</span></div>
        <div><b>MY PROFILE</b><span>Change administrator display name, email/password, and local backup reminder settings.</span></div>
        <div><b>ADMIN ACCESS</b><span>Manage registration/factory-reset PIN settings and the administrator directory. Disable or enable other administrator accounts when appropriate.</span></div>
        <div><b>BACKUP / RESTORE</b><span>Create JSON/XLSX backups, import a backup, choose merge or replace mode, and verify backup history.</span></div>
        <div><b>DATA STATUS</b><span>Run the live Firebase data status scan and inspect mapped collection counts and latest activity.</span></div>
        <div><b>MAINTENANCE</b><span>Recovery archives, recent audit activity, old-activity consolidation, and destructive factory reset controls.</span></div>
      </div>
      <div className="guide-warning-inline"><b>BEGINNER ADMIN RULE:</b> Read the tab before clicking a destructive button. If you cannot explain what will happen, do not click it yet.</div>
    </GuideSection>

    <GuideSection number="10" title="ADMIN PROFILE & ADMIN ACCESS" categories={["ADMIN"]} kicker="SECURITY">
      <div className="guide-step-stack">
        <GuideStep number="1" title="MY PROFILE">Use this tab for your display name, email/password changes, and local backup reminder interval.</GuideStep>
        <GuideStep number="2" title="Password/email changes">If the form requests your current password, provide it before changing protected credentials.</GuideStep>
        <GuideStep number="3" title="ADMIN ACCESS">Registration PIN and factory-reset PIN are separate security values. Keep them private.</GuideStep>
        <GuideStep number="4" title="Administrator directory">Your current session cannot be disabled by its own row. For another administrator, use ENABLE/DISABLE only when you understand the effect.</GuideStep>
      </div>
      <div className="guide-security-box"><b>NEVER SHARE</b><span>Administrator password • registration PIN • factory-reset PIN • backup files containing sensitive data</span></div>
    </GuideSection>

    <GuideSection number="11" title="FILTERS, SEARCH, SORTING & LATEST-FIRST HISTORY" categories={["FILTERS"]} kicker="EVERY TABLE">
      <GuideFilterDemo />
      <GuideSortDemo />
      <div className="guide-step-stack">
        <GuideStep number="1" title="Clear filters before troubleshooting">A hidden record is often a filtered record.</GuideStep>
        <GuideStep number="2" title="Use exact dates when correcting records">Do not edit a similar-looking event from another day.</GuideStep>
        <GuideStep number="3" title="Start at the newest timestamp">Activity/history tables should put the latest datetime first.</GuideStep>
        <GuideStep number="4" title="Verify after changing a record">Search the same player/date/event again and make sure the final state is correct.</GuideStep>
      </div>
    </GuideSection>

    <GuideSection number="12" title="ACTIVITY & NOTIFICATIONS — YOUR AUDIT TRAIL" categories={["AUDIT"]} kicker="AUDIT">
      <GuideMockScreen title="ACTIVITY & NOTIFICATIONS" subtitle="Newest activity first" rows={[["2026-09-06 18:42", "BH ATTENDANCE UPDATED", "NEW"],["2026-09-06 18:35", "REWARD ASSIGNED", "NEW"],["2026-09-05 21:10", "CW ITEM UPDATED", "OLD"]]} />
      <div className="guide-step-stack">
        <GuideStep number="1" title="Look at the newest entry">Start at the top of the activity table.</GuideStep>
        <GuideStep number="2" title="Read category/title">Identify whether the change concerns attendance, reward, item, salary, Treasury, schedule, player, or administration.</GuideStep>
        <GuideStep number="3" title="Open long entries">If the row is shortened with an ellipsis, select/click it to inspect the full details when the interface provides that behavior.</GuideStep>
        <GuideStep number="4" title="Use filters">Filter by category, administrator, player/event, or other controls shown on the page to narrow the audit trail.</GuideStep>
      </div>
      <div className="guide-tip-box"><b>NEW / OLD:</b> Treat these as a quick visual age indicator. Always use the actual datetime when precise timing matters.</div>
    </GuideSection>

    <GuideSection number="13" title="BACKUP / RESTORE — EXACT STEP-BY-STEP" categories={["BACKUP"]} kicker="BACKUP" warning>
      <GuidePath>ADMIN → <b>BACKUP / RESTORE</b></GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Create a backup before major changes">Do this before factory reset, major maintenance, large corrections, or any operation you cannot easily undo.</GuideStep>
        <GuideStep number="2" title="Click BACKUP + DOWNLOAD BOTH • ZIP">The application creates a bundle containing a human-readable XLSX, an exact JSON restore file, and README information.</GuideStep>
        <GuideStep number="3" title="Find the downloaded ZIP">Check the browser download area or your normal Downloads folder.</GuideStep>
        <GuideStep number="4" title="Verify the file exists">Open the folder and confirm the ZIP is actually present. A click is not proof that the backup completed.</GuideStep>
        <GuideStep number="5" title="Keep a known-good copy">For important changes, preserve a copy somewhere safe before proceeding.</GuideStep>
        <GuideStep number="6" title="Restore only deliberately">Choose the backup file, choose MERGE or REPLACE, read the mode description, and start the restore only after understanding the effect.</GuideStep>
        <GuideStep number="7" title="Remember REPLACE archives first">Replace mode creates a safety archive before clearing mapped data, according to the application's current recovery workflow.</GuideStep>
        <GuideStep number="8" title="Verify after restore">Check Data Status, player records, BH/CW history, rewards/items/Treasury, and recent activity as applicable.</GuideStep>
      </div>
      <div className="guide-backup-flow"><span>BACKUP</span><b>→</b><span>VERIFY FILE</span><b>→</b><span>MAINTENANCE</span><b>→</b><span>VERIFY DATA</span></div>
    </GuideSection>

    <GuideSection number="14" title="DATA STATUS — CHECK THE REAL APPLICATION DATA" categories={["ADMIN"]} kicker="DATA STATUS">
      <GuidePath>ADMIN → <b>DATA STATUS</b> → RUN FIREBASE DATA STATUS SCAN</GuidePath>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Open DATA STATUS">This is the application's mapped data inventory, not a generic Firebase quota display.</GuideStep>
        <GuideStep number="2" title="Run the scan">Click <b>RUN FIREBASE DATA STATUS SCAN</b>.</GuideStep>
        <GuideStep number="3" title="Read the summary">Check Firestore status, authentication session, collection count, and total document count.</GuideStep>
        <GuideStep number="4" title="Inspect collection rows">Look for document counts and last activity. An empty collection is not automatically an error; compare it with what your application is supposed to use.</GuideStep>
        <GuideStep number="5" title="Use Firebase Console for billing/quota">The application's Data Status page is for mapped guild data. Firebase Console remains authoritative for service quota/billing measurements.</GuideStep>
      </div>
    </GuideSection>

    <GuideSection number="15" title="MAINTENANCE & RECOVERY ARCHIVES" categories={["RECOVERY"]} kicker="RECOVERY">
      <div className="guide-step-stack">
        <GuideStep number="1" title="Understand the 90-day recovery window">Supported reset/replace/consolidation operations create recovery archives. Review the archive's reason, record count, creation date, and expiry.</GuideStep>
        <GuideStep number="2" title="Restore a recovery point when necessary">Select the appropriate archive and use <b>RESTORE POINT</b> only after confirming it is the correct archive.</GuideStep>
        <GuideStep number="3" title="Refresh archive status">Use <b>REFRESH</b> after recovery-related operations when needed.</GuideStep>
        <GuideStep number="4" title="Understand consolidation">Old detailed activity can be consolidated into monthly summaries after an archive is created. This is maintenance, not a correction tool for a single record.</GuideStep>
      </div>
      <div className="guide-tip-box"><b>RECOVERY RULE:</b> If you need to recover data, stop normal editing first. Identify the exact archive and document what you are about to restore.</div>
    </GuideSection>

    <GuideSection number="16" title="FACTORY RESET — LAST RESORT ONLY" categories={["SAFETY"]} kicker="DESTRUCTIVE" warning>
      <div className="guide-danger-large"><b>THIS CAN REMOVE OPERATIONAL DATA.</b><span>Do not use factory reset to fix one attendance, one player, one reward, or one Treasury mistake.</span></div>
      <div className="guide-step-stack">
        <GuideStep number="1" title="Identify why a reset is required">Factory reset is for a new week/season or another deliberate full operational reset, not ordinary corrections.</GuideStep>
        <GuideStep number="2" title="Create and verify a backup">Download the JSON + XLSX ZIP and confirm it exists on your computer.</GuideStep>
        <GuideStep number="3" title="Review DATA STATUS">Know what data currently exists before you remove it.</GuideStep>
        <GuideStep number="4" title="Understand recovery">A complete recovery archive is created first by the supported reset workflow. Administrator accounts/security settings are preserved by the current design.</GuideStep>
        <GuideStep number="5" title="Enter the factory-reset PIN deliberately">Do not confuse the factory-reset PIN with the administrator registration PIN.</GuideStep>
        <GuideStep number="6" title="After reset, verify">Refresh the application and inspect the expected new operational state.</GuideStep>
      </div>
      <div className="guide-reset-equation"><span>BACKUP</span><b>+</b><span>VERIFY</span><b>+</b><span>CONFIRM PIN</span><b>+</b><span>RESET</span><b>+</b><span>VERIFY AGAIN</span></div>
    </GuideSection>

    <GuideSection number="17" title="TROUBLESHOOTING — ADMIN DECISION TREE" categories={["SAFETY"]} kicker="PROBLEM SOLVING">
      <div className="guide-decision-tree admin-tree">
        <div><b>1</b><span>Is the wrong record visible?</span></div><i>↓</i><div><b>2</b><span>Clear filters + verify date/timezone.</span></div><i>↓</i><div><b>3</b><span>Check source record/history.</span></div><i>↓</i><div><b>4</b><span>Correct once.</span></div><i>↓</i><div><b>5</b><span>Verify result + activity.</span></div>
      </div>
      <div className="guide-step-stack">
        <GuideStep number="A" title="Page appears empty">Clear filters, refresh the page, and verify you are looking at the correct date/occurrence.</GuideStep>
        <GuideStep number="B" title="A record appears duplicated">Do not delete or add records immediately. Identify the IDs/details and determine whether one is an actual duplicate or a legitimate separate transaction.</GuideStep>
        <GuideStep number="C" title="A protected button is missing">Confirm your session still shows ADMIN and that your administrator account remains active.</GuideStep>
        <GuideStep number="D" title="Backup/restore problem">Stop destructive work. Confirm the selected file, mode, and downloaded backup before retrying.</GuideStep>
      </div>
    </GuideSection>

    <GuideSection number="18" title="DAILY ADMIN CHECKLIST" categories={["START HERE"]} kicker="ROUTINE">
      <div className="guide-checklist-large">
        {["Check new Guild Questions", "Review today's BH attendance", "Review today's CW attendance", "Check newest activity/notifications", "Check rewards and inventory changes", "Check salary/Treasury changes", "Investigate unusual records", "Verify important corrections", "Create backup when the reminder is due", "Never use factory reset for a small correction"].map((item) => <label key={item}><input type="checkbox" /> <span>{item}</span></label>)}
      </div>
      <div className="guide-tip-box"><b>GOOD ADMIN HABIT:</b> Work newest → oldest. Verify source record → make one correction → verify result → check activity.</div>
    </GuideSection>

    <GuideSection number="19" title="QUICK REFERENCE — ADMIN ACTIONS" categories={["SAFETY"]} kicker="CHEAT SHEET">
      <div className="guide-quick-grid admin-quick">
        <div><b>PLAYER</b><span>Add/edit/disable/manage roster information</span><strong>BH / PLAYER TOOLS</strong></div>
        <div><b>BH</b><span>Attendance, points, rewards, history</span><strong>BH ATTENDANCE</strong></div>
        <div><b>CW</b><span>Attendance, salary, items, Treasury</span><strong>CW ATTENDANCE</strong></div>
        <div><b>TICKET</b><span>Investigate and respond to reports</span><strong>GUILD QUESTIONS</strong></div>
        <div><b>BACKUP</b><span>Create/restore application data</span><strong>ADMIN → BACKUP</strong></div>
        <div><b>RECOVERY</b><span>Archives and maintenance</span><strong>ADMIN → MAINTENANCE</strong></div>
      </div>
    </GuideSection>

    <div className="guide-final-check admin"><b>ADMIN FINAL RULE:</b> Identify → Filter → Verify → Change once → Verify again → Check Activity. Backup before major/destructive operations.</div>
      </>
    </GuideFilterContext.Provider>
  );
}

export default function GuideManual({ isAdmin, guideMode, guideFilter, setGuideFilter, closeGuide, images }) {
  const adminMode = guideMode === "new-admin" || isAdmin;
  const filters = adminMode
    ? ["ALL", "START HERE", "NAVIGATION", "RAID", "BH", "CW", "TICKETS", "ADMIN", "FILTERS", "AUDIT", "BACKUP", "RECOVERY", "SAFETY"]
    : ["ALL", "START HERE", "NAVIGATION", "RAID", "BH", "CW", "FILTERS", "HISTORY", "TICKETS", "YOUR ACCESS", "HELP"];

  const allowed = (names) => guideFilter === "ALL" || names.includes(guideFilter);

  return (
    <div className="guide-manual guide-manual-pro">
      <div className="guide-hero">
        <div className="guide-hero-copy">
          <div className="guide-kicker">RAN ONLINE EP7 CLASSIC • {guideMode === "new-admin" ? "FIRST LOGIN" : adminMode ? "ADMIN CONTROL MANUAL" : "PLAYER / USER MANUAL"}</div>
          <h2>{guideMode === "new-admin" ? "START HERE — COMPLETE ADMIN WALKTHROUGH" : adminMode ? "ADMINISTRATOR CONTROL MANUAL" : "HOW TO USE THE GUILD DASHBOARD"}</h2>
          <p>This manual assumes you have <b>never used the dashboard before</b>. Follow the numbered steps in order. Every major task explains where you are, what to click, what you should see, how to filter/sort, how to verify the result, and what to do when something is wrong.</p>
        </div>
        <div className="guide-hero-art"><img src={adminMode ? images.ranVIcon : images.heroGuideImage} alt="RAN Online guide" /></div>
      </div>

      <div className="guide-filter-bar">
        <div className="guide-filter-label">FILTER MANUAL</div>
        <div className="guide-filter-buttons">{filters.map((filter) => <button key={filter} type="button" className={`guide-filter ${guideFilter === filter ? "active" : ""}`} onClick={() => setGuideFilter(filter)}>{filter}</button>)}</div>
      </div>

      <div className="guide-note"><span className="guide-note-icon">!</span><div><b>BEGINNER RULE:</b> If you are unsure what to click, do not guess. Read the relevant section first. Administrators should verify the resulting record and activity after protected changes.</div></div>

      {adminMode ? <AdminGuide images={images} filter={guideFilter} /> : <UserGuide images={images} filter={guideFilter} />}

      <div className="guide-footer guide-footer-pro"><span><b>TIP:</b> Keep this manual open while learning. If an instruction says VERIFY, stop and check the screen before saving.</span><button type="button" className="button primary" onClick={closeGuide}>DONE • CLOSE GUIDE</button></div>
    </div>
  );
}
