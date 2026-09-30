// Conservative, curated name transliterations. Unknown spellings remain unchanged;
// this intentionally avoids guessing Malayalam pronunciation from English letters.
const names = {
  hadi: "ഹാദി",
  sinan: "സിനാൻ",
  javeed: "ജാവീദ്",
  javed: "ജാവേദ്",
  abdul: "അബ്ദുൽ",
  abdullah: "അബ്ദുള്ള",
  mohammed: "മുഹമ്മദ്",
  muhammad: "മുഹമ്മദ്",
  ahmed: "അഹമ്മദ്",
  ahmad: "അഹമ്മദ്",
  ali: "അലി",
  omar: "ഒമർ",
  umar: "ഉമർ",
  anas: "അനസ്",
  arjun: "അർജുൻ",
  rahul: "രാഹുൽ",
  vishnu: "വിഷ്ണു",
  arun: "അരുൺ",
  amal: "അമൽ",
  nikhil: "നിഖിൽ",
  akhil: "അഖിൽ",
  aswin: "അശ്വിൻ",
  ashwin: "അശ്വിൻ",
  adithya: "ആദിത്യ",
  aditya: "ആദിത്യ",
  krishna: "കൃഷ്ണ",
  devika: "ദേവിക",
  anjali: "അഞ്ജലി",
  lakshmi: "ലക്ഷ്മി",
  aisha: "ആയിഷ",
  ayesha: "ആയിഷ",
  fathima: "ഫാത്തിമ",
  fatima: "ഫാത്തിമ",
  sara: "സാറ",
  sarah: "സാറ",
  mariya: "മരിയ",
  maria: "മരിയ",
  sneha: "സ്നേഹ",
  diya: "ദിയ",
  riya: "റിയ",
  anu: "അനു",
  roshan: "റോഷൻ",
  irfan: "ഇർഫാൻ",
  shamil: "ഷാമിൽ",
  shan: "ഷാൻ",
};
export function malayalamDisplayName(username) {
  if (/^[\u0d00-\u0d7f\s]+$/u.test(username)) return username;
  const parts = username.trim().split(/\s+/);
  if (!parts.length || parts.some((p) => !names[p.toLowerCase()]))
    return username;
  return parts.map((p) => names[p.toLowerCase()]).join(" ");
}
