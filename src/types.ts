export interface UserInfo {
  nickname: string;
  birthDate: string;
  birthTime?: string;
  birthPlace?: string;
}

export interface AstroInfo {
  todayDate: string;
  lunarPhase: string;
  majorTransits: string;
}

export interface DreamResult {
  title: string;
  image: string;
  underneath: string;
  echo: string;
  mirror: string;
  one_small_act: string;
  image_prompt: string;
  omens: {
    lucky_color: string;
    lucky_color_name: string;
    lucky_number: number;
    reason: string;
  };
  sound_config: {
    theme: 'liquid' | 'dust' | 'ember' | 'wood' | 'hollow' | 'sterile' | 'pursuit';
    drone_hz: number;
    pulse_rate: number;
    texture_intensity: number;
  };
  imageUrl?: string;
}

export enum AppStage {
  INPUT_PROFILE = 'INPUT_PROFILE',
  INPUT_DREAM = 'INPUT_DREAM',
  INTERPRETING = 'INTERPRETING',
  RESULT = 'RESULT'
}
