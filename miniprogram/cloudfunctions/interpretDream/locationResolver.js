const CITY_LOCATIONS = [
  { name: '北京', aliases: ['北京', '北京市'], latitude: 39.9042, longitude: 116.4074 },
  { name: '上海', aliases: ['上海', '上海市'], latitude: 31.2304, longitude: 121.4737 },
  { name: '天津', aliases: ['天津', '天津市'], latitude: 39.3434, longitude: 117.3616 },
  { name: '重庆', aliases: ['重庆', '重庆市'], latitude: 29.563, longitude: 106.5516 },
  { name: '青岛', aliases: ['青岛', '青岛市'], latitude: 36.0671, longitude: 120.3826 },
  { name: '济南', aliases: ['济南', '济南市', '山东济南'], latitude: 36.6512, longitude: 117.1201 },
  { name: '烟台', aliases: ['烟台', '烟台市'], latitude: 37.4638, longitude: 121.4479 },
  { name: '济宁', aliases: ['济宁', '济宁市'], latitude: 35.4149, longitude: 116.5871 },
  { name: '临沂', aliases: ['临沂', '临沂市'], latitude: 35.1047, longitude: 118.3564 },
  { name: '南京', aliases: ['南京', '南京市'], latitude: 32.0603, longitude: 118.7969 },
  { name: '苏州', aliases: ['苏州', '苏州市'], latitude: 31.2989, longitude: 120.5853 },
  { name: '无锡', aliases: ['无锡', '无锡市'], latitude: 31.4912, longitude: 120.3119 },
  { name: '杭州', aliases: ['杭州', '杭州市'], latitude: 30.2741, longitude: 120.1551 },
  { name: '宁波', aliases: ['宁波', '宁波市'], latitude: 29.8683, longitude: 121.544 },
  { name: '温州', aliases: ['温州', '温州市'], latitude: 27.9949, longitude: 120.6994 },
  { name: '合肥', aliases: ['合肥', '合肥市'], latitude: 31.8206, longitude: 117.2272 },
  { name: '福州', aliases: ['福州', '福州市'], latitude: 26.0745, longitude: 119.2965 },
  { name: '厦门', aliases: ['厦门', '厦门市'], latitude: 24.4798, longitude: 118.0894 },
  { name: '南昌', aliases: ['南昌', '南昌市'], latitude: 28.6829, longitude: 115.8579 },
  { name: '武汉', aliases: ['武汉', '武汉市'], latitude: 30.5928, longitude: 114.3055 },
  { name: '长沙', aliases: ['长沙', '长沙市'], latitude: 28.2282, longitude: 112.9388 },
  { name: '广州', aliases: ['广州', '广州市'], latitude: 23.1291, longitude: 113.2644 },
  { name: '深圳', aliases: ['深圳', '深圳市'], latitude: 22.5431, longitude: 114.0579 },
  { name: '佛山', aliases: ['佛山', '佛山市'], latitude: 23.0218, longitude: 113.1214 },
  { name: '东莞', aliases: ['东莞', '东莞市'], latitude: 23.0205, longitude: 113.7518 },
  { name: '郑州', aliases: ['郑州', '郑州市'], latitude: 34.7466, longitude: 113.6254 },
  { name: '石家庄', aliases: ['石家庄', '石家庄市'], latitude: 38.0428, longitude: 114.5149 },
  { name: '唐山', aliases: ['唐山', '唐山市'], latitude: 39.6305, longitude: 118.1802 },
  { name: '太原', aliases: ['太原', '太原市'], latitude: 37.8706, longitude: 112.5489 },
  { name: '沈阳', aliases: ['沈阳', '沈阳市'], latitude: 41.8057, longitude: 123.4315 },
  { name: '大连', aliases: ['大连', '大连市'], latitude: 38.914, longitude: 121.6147 },
  { name: '长春', aliases: ['长春', '长春市'], latitude: 43.8171, longitude: 125.3235 },
  { name: '哈尔滨', aliases: ['哈尔滨', '哈尔滨市'], latitude: 45.8038, longitude: 126.6424 },
  { name: '成都', aliases: ['成都', '成都市'], latitude: 30.5728, longitude: 104.0665 },
  { name: '贵阳', aliases: ['贵阳', '贵阳市'], latitude: 26.647, longitude: 106.6302 },
  { name: '昆明', aliases: ['昆明', '昆明市'], latitude: 25.0389, longitude: 102.8329 },
  { name: '南宁', aliases: ['南宁', '南宁市'], latitude: 22.817, longitude: 108.3669 },
  { name: '海口', aliases: ['海口', '海口市'], latitude: 20.044, longitude: 110.3312 },
  { name: '西安', aliases: ['西安', '西安市'], latitude: 34.3416, longitude: 108.9398 },
  { name: '兰州', aliases: ['兰州', '兰州市'], latitude: 36.0611, longitude: 103.8343 },
  { name: '银川', aliases: ['银川', '银川市'], latitude: 38.4872, longitude: 106.2309 },
  { name: '西宁', aliases: ['西宁', '西宁市'], latitude: 36.6171, longitude: 101.7782 },
  { name: '乌鲁木齐', aliases: ['乌鲁木齐', '乌鲁木齐市'], latitude: 43.8256, longitude: 87.6168 },
  { name: '呼和浩特', aliases: ['呼和浩特', '呼和浩特市'], latitude: 40.8426, longitude: 111.7492 },
  { name: '拉萨', aliases: ['拉萨', '拉萨市'], latitude: 29.652, longitude: 91.1409 },
  { name: '香港', aliases: ['香港', '香港特别行政区'], latitude: 22.3193, longitude: 114.1694 },
  { name: '澳门', aliases: ['澳门', '澳门特别行政区'], latitude: 22.1987, longitude: 113.5439 },
  { name: '台北', aliases: ['台北', '台北市'], latitude: 25.033, longitude: 121.5654 }
].map(function (location) {
  return Object.assign({}, location, {
    timezone: 'Asia/Shanghai',
    utcOffsetMinutes: 480,
    standardMeridian: 120,
    timezoneRule: 'UTC+08:00；中国现代民用时间，未建模历史夏令时'
  });
});

// 上面 49 个城市只覆盖省会和主要地级市。用户写「山东临沭」「河南周口」这类
// 地名时会整个解析失败，功能直接不可用——而报错还只说「请补充出生城市」。
// 省级兜底用省会经度近似：跨省最多相差一两个经度，真太阳时误差约几分钟，
// 只在极少数贴着时辰边界的情况下才会影响时柱。这比因为不认识地名就拒绝
// 出具解读要诚实得多，所以兜底结果会显式标注精度已降级。
const PROVINCE_FALLBACKS = [
  { name: '山东', capital: '济南', aliases: ['山东'] },
  { name: '江苏', capital: '南京', aliases: ['江苏'] },
  { name: '浙江', capital: '杭州', aliases: ['浙江'] },
  { name: '安徽', capital: '合肥', aliases: ['安徽'] },
  { name: '福建', capital: '福州', aliases: ['福建'] },
  { name: '江西', capital: '南昌', aliases: ['江西'] },
  { name: '湖北', capital: '武汉', aliases: ['湖北'] },
  { name: '湖南', capital: '长沙', aliases: ['湖南'] },
  { name: '广东', capital: '广州', aliases: ['广东'] },
  { name: '河南', capital: '郑州', aliases: ['河南'] },
  { name: '河北', capital: '石家庄', aliases: ['河北'] },
  { name: '山西', capital: '太原', aliases: ['山西'] },
  { name: '辽宁', capital: '沈阳', aliases: ['辽宁'] },
  { name: '吉林', capital: '长春', aliases: ['吉林'] },
  { name: '黑龙江', capital: '哈尔滨', aliases: ['黑龙江'] },
  { name: '四川', capital: '成都', aliases: ['四川'] },
  { name: '贵州', capital: '贵阳', aliases: ['贵州'] },
  { name: '云南', capital: '昆明', aliases: ['云南'] },
  { name: '广西', capital: '南宁', aliases: ['广西'] },
  { name: '海南', capital: '海口', aliases: ['海南'] },
  { name: '陕西', capital: '西安', aliases: ['陕西'] },
  { name: '甘肃', capital: '兰州', aliases: ['甘肃'] },
  { name: '宁夏', capital: '银川', aliases: ['宁夏'] },
  { name: '青海', capital: '西宁', aliases: ['青海'] },
  { name: '新疆', capital: '乌鲁木齐', aliases: ['新疆'] },
  { name: '内蒙古', capital: '呼和浩特', aliases: ['内蒙古', '内蒙'] },
  { name: '西藏', capital: '拉萨', aliases: ['西藏'] },
  { name: '台湾', capital: '台北', aliases: ['台湾'] }
];

function normalizePlace(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，,]/g, '');
}

function resolveBirthPlace(value) {
  var input = String(value || '').trim();
  var normalized = normalizePlace(input);
  var match = null;

  if (!normalized) return null;

  CITY_LOCATIONS.some(function (location) {
    return location.aliases.some(function (alias) {
      var key = normalizePlace(alias);
      if (normalized === key || normalized.indexOf(key) >= 0) {
        match = location;
        return true;
      }
      return false;
    });
  });

  if (match) return Object.assign({}, match, { input: input, precision: 'city' });

  // 城市认不出来时退到省级中心，而不是整个拒绝。
  PROVINCE_FALLBACKS.some(function (province) {
    return province.aliases.some(function (alias) {
      if (normalized.indexOf(normalizePlace(alias)) < 0) return false;
      var capital = null;
      CITY_LOCATIONS.some(function (location) {
        if (location.name !== province.capital) return false;
        capital = location;
        return true;
      });
      if (!capital) return false;
      match = Object.assign({}, capital, {
        name: province.name,
        precision: 'province',
        approximatedFrom: province.capital
      });
      return true;
    });
  });

  return match ? Object.assign({}, match, { input: input }) : null;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function dayOfYear(year, month, day) {
  var monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var total = day;
  var index;

  for (index = 0; index < month - 1; index += 1) {
    total += monthDays[index];
  }

  return total;
}

function equationOfTimeMinutes(year, month, day) {
  var angle = (2 * Math.PI * (dayOfYear(year, month, day) - 81)) / 364;
  return 9.87 * Math.sin(2 * angle) - 7.53 * Math.cos(angle) - 1.5 * Math.sin(angle);
}

function pad(value) {
  return value < 10 ? '0' + value : String(value);
}

function parseDateTime(dateValue, timeValue) {
  var dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
  var timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(timeValue || ''));
  var year;
  var month;
  var day;
  var hour;
  var minute;
  var date;

  if (!dateMatch || !timeMatch) return null;

  year = Number(dateMatch[1]);
  month = Number(dateMatch[2]);
  day = Number(dateMatch[3]);
  hour = Number(timeMatch[1]);
  minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return { year: year, month: month, day: day, hour: hour, minute: minute };
}

function correctToTrueSolarTime(dateValue, timeValue, location) {
  var parsed = parseDateTime(dateValue, timeValue);
  var localMeanUtc;
  var equation;
  var longitude;
  var correction;
  var correctedUtc;
  var correctedLocal;

  if (!parsed || !location) {
    return { ok: false, reason: 'invalid_datetime_or_location' };
  }

  localMeanUtc = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
    0
  ) - location.utcOffsetMinutes * 60000;
  equation = equationOfTimeMinutes(parsed.year, parsed.month, parsed.day);
  longitude = (location.longitude - location.standardMeridian) * 4;
  correction = equation + longitude;
  correctedUtc = localMeanUtc + correction * 60000;
  correctedLocal = new Date(correctedUtc + location.utcOffsetMinutes * 60000);

  return {
    ok: true,
    date: correctedLocal.getUTCFullYear() + '-' + pad(correctedLocal.getUTCMonth() + 1) + '-' + pad(correctedLocal.getUTCDate()),
    time: pad(correctedLocal.getUTCHours()) + ':' + pad(correctedLocal.getUTCMinutes()),
    equationOfTimeMinutes: Number(equation.toFixed(3)),
    longitudeCorrectionMinutes: Number(longitude.toFixed(3)),
    totalCorrectionMinutes: Number(correction.toFixed(3)),
    sourceDate: dateValue,
    sourceTime: timeValue
  };
}

module.exports = {
  resolveBirthPlace: resolveBirthPlace,
  correctToTrueSolarTime: correctToTrueSolarTime,
  equationOfTimeMinutes: equationOfTimeMinutes
};
