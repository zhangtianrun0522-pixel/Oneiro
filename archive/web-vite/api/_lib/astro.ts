export function getAstroInfo(): { todayDate: string; lunarPhase: string; majorTransits: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const todayDate = `${year}年${month}月${day}日`;

  // 月相计算（基于已知新月基准日）
  const knownNewMoon = new Date(2000, 0, 6).getTime();
  const msPerDay = 86400000;
  const daysDiff = (now.getTime() - knownNewMoon) / msPerDay;
  const lunarAge = ((daysDiff % 29.53058867) + 29.53058867) % 29.53058867;
  const phase = lunarAge / 29.53058867;
  const phaseNames = ['新月', '峨眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];
  const phaseName = phaseNames[Math.round(phase * 8) % 8];

  // 月亮所在黄道星座（粗略）
  const zodiacSigns = ['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座'];
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / msPerDay);
  const moonSign = zodiacSigns[Math.floor(((dayOfYear + 10) % 365) / 30.4) % 12];
  const lunarPhase = `${phaseName} · 月亮在${moonSign}`;

  // 基于日期的确定性行星描述
  const seed = year * 10000 + month * 100 + day;
  const templates = [
    `太阳与火星形成和谐三分相，行动力旺盛。水星逆行渐止，思绪趋于清晰。`,
    `金星与木星在${zodiacSigns[seed % 12]}座相遇，爱与幸运交织。土星凝视远方，提醒承诺的重量。`,
    `天王星在${zodiacSigns[(seed + 3) % 12]}座掀起变革之风，海王星令梦境边界模糊。`,
    `火星进入${zodiacSigns[(seed + 7) % 12]}座，点燃勇气之火。冥王星揭示隐藏的真相。`,
    `水星与金星在${zodiacSigns[(seed + 5) % 12]}座共舞，沟通充满魅力与灵感。`,
    `木星在${zodiacSigns[(seed + 9) % 12]}座逆行，引导回顾信念的根基。`,
    `太阳进入${zodiacSigns[day % 12]}座，带来新的节奏。火星与海王星激发灵性行动力。`,
  ];
  const majorTransits = templates[Math.abs(seed) % templates.length];

  return { todayDate, lunarPhase, majorTransits };
}
