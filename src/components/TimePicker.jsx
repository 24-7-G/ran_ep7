export default function TimePicker({ value, onChange }) {
  const h = Number(value?.hour ?? 12);
  const m = Number(value?.minute ?? 0);
  const hh = h % 12 || 12;
  const ap = h >= 12 ? "PM" : "AM";
  return (
    <div className="time-picker">
      <select value={hh} onChange={e => {
        let nh = Number(e.target.value);
        if (ap === "PM" && nh !== 12) nh += 12;
        if (ap === "AM" && nh === 12) nh = 0;
        onChange({ hour: nh, minute: m });
      }}>
        {Array.from({length:12}, (_,i) => i+1).map(x => <option key={x}>{x}</option>)}
      </select>
      <span>:</span>
      <select value={String(m).padStart(2,"0")} onChange={e => onChange({hour:h, minute:Number(e.target.value)})}>
        {[0,10,20,30,40,50].map(x => <option key={x} value={String(x).padStart(2,"0")}>{String(x).padStart(2,"0")}</option>)}
      </select>
      <select value={ap} onChange={e => {
        let nh = h;
        if (e.target.value === "PM" && nh < 12) nh += 12;
        if (e.target.value === "AM" && nh >= 12) nh -= 12;
        onChange({hour:nh, minute:m});
      }}>
        <option>AM</option><option>PM</option>
      </select>
    </div>
  );
}