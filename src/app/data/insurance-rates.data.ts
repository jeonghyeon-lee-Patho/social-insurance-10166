/**
 * 保険基準マスタデータ
 * 協会けんぽの地域別健康保険料率（2024年度）
 * 出典：全国健康保険協会 (https://www.kyokaihoken.or.jp/)
 */

import { InsuranceRegion, KyokaiRateData } from '../models/insurance-rate.model';

/**
 * 協会けんぽの地域別料率データ（全国）
 * 労使折半（各50%）固定
 * 介護保険料率：全国共通 1.60%
 * 厚生年金保険料率：全国共通 18.30%
 */
export const KYOKAI_RATES_DATA: KyokaiRateData[] = [
  // 北海道
  { region: InsuranceRegion.HOKKAIDO, prefecture: '北海道', healthInsuranceRate: 10.21, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },

  // 北海道・東北エリア
  { region: InsuranceRegion.TOHOKU, prefecture: '青森県', healthInsuranceRate: 9.49, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.TOHOKU, prefecture: '岩手県', healthInsuranceRate: 9.79, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.TOHOKU, prefecture: '宮城県', healthInsuranceRate: 9.70, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.TOHOKU, prefecture: '秋田県', healthInsuranceRate: 10.04, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.TOHOKU, prefecture: '山形県', healthInsuranceRate: 9.97, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.TOHOKU, prefecture: '福島県', healthInsuranceRate: 10.11, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },

  // 関東エリア
  { region: InsuranceRegion.KANTO, prefecture: '茨城県', healthInsuranceRate: 9.84, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANTO, prefecture: '栃木県', healthInsuranceRate: 9.72, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANTO, prefecture: '群馬県', healthInsuranceRate: 9.84, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANTO, prefecture: '埼玉県', healthInsuranceRate: 9.97, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANTO, prefecture: '千葉県', healthInsuranceRate: 10.00, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANTO, prefecture: '東京都', healthInsuranceRate: 9.98, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANTO, prefecture: '神奈川県', healthInsuranceRate: 10.10, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },

  // 中部エリア
  { region: InsuranceRegion.CHUBU, prefecture: '新潟県', healthInsuranceRate: 9.85, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUBU, prefecture: '富山県', healthInsuranceRate: 9.61, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUBU, prefecture: '石川県', healthInsuranceRate: 9.71, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUBU, prefecture: '福井県', healthInsuranceRate: 9.46, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUBU, prefecture: '山梨県', healthInsuranceRate: 10.03, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUBU, prefecture: '長野県', healthInsuranceRate: 9.61, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUBU, prefecture: '岐阜県', healthInsuranceRate: 9.72, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUBU, prefecture: '静岡県', healthInsuranceRate: 9.85, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUBU, prefecture: '愛知県', healthInsuranceRate: 10.00, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUBU, prefecture: '三重県', healthInsuranceRate: 9.88, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },

  // 近畿エリア
  { region: InsuranceRegion.KANSAI, prefecture: '滋賀県', healthInsuranceRate: 9.81, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANSAI, prefecture: '京都府', healthInsuranceRate: 9.78, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANSAI, prefecture: '大阪府', healthInsuranceRate: 10.34, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANSAI, prefecture: '兵庫県', healthInsuranceRate: 10.03, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANSAI, prefecture: '奈良県', healthInsuranceRate: 9.81, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KANSAI, prefecture: '和歌山県', healthInsuranceRate: 10.03, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },

  // 中国エリア
  { region: InsuranceRegion.CHUGOKU, prefecture: '鳥取県', healthInsuranceRate: 9.82, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUGOKU, prefecture: '島根県', healthInsuranceRate: 9.93, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUGOKU, prefecture: '岡山県', healthInsuranceRate: 9.97, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUGOKU, prefecture: '広島県', healthInsuranceRate: 9.96, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.CHUGOKU, prefecture: '山口県', healthInsuranceRate: 10.02, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },

  // 四国エリア
  { region: InsuranceRegion.SHIKOKU, prefecture: '徳島県', healthInsuranceRate: 10.22, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.SHIKOKU, prefecture: '香川県', healthInsuranceRate: 10.20, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.SHIKOKU, prefecture: '愛媛県', healthInsuranceRate: 10.04, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.SHIKOKU, prefecture: '高知県', healthInsuranceRate: 10.21, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },

  // 九州エリア
  { region: InsuranceRegion.KYUSHU, prefecture: '福岡県', healthInsuranceRate: 10.07, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KYUSHU, prefecture: '佐賀県', healthInsuranceRate: 10.05, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KYUSHU, prefecture: '長崎県', healthInsuranceRate: 10.21, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KYUSHU, prefecture: '熊本県', healthInsuranceRate: 10.03, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KYUSHU, prefecture: '大分県', healthInsuranceRate: 10.16, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KYUSHU, prefecture: '宮崎県', healthInsuranceRate: 10.11, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KYUSHU, prefecture: '鹿児島県', healthInsuranceRate: 10.24, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 },
  { region: InsuranceRegion.KYUSHU, prefecture: '沖縄県', healthInsuranceRate: 9.52, careInsuranceRate: 1.60, pensionInsuranceRate: 18.30, employerBurden: 50, employeeBurden: 50 }
];

/**
 * エリア -> 都道府県マッピング
 */
export const REGION_PREFECTURE_MAP: Record<InsuranceRegion, string[]> = {
  [InsuranceRegion.HOKKAIDO]: ['北海道'],
  [InsuranceRegion.TOHOKU]: ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
  [InsuranceRegion.KANTO]: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
  [InsuranceRegion.CHUBU]: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県'],
  [InsuranceRegion.KANSAI]: ['滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
  [InsuranceRegion.CHUGOKU]: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'],
  [InsuranceRegion.SHIKOKU]: ['徳島県', '香川県', '愛媛県', '高知県'],
  [InsuranceRegion.KYUSHU]: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県']
};

/**
 * エリア表示名マッピング
 */
export const REGION_DISPLAY_MAP: Record<InsuranceRegion, string> = {
  [InsuranceRegion.HOKKAIDO]: '北海道',
  [InsuranceRegion.TOHOKU]: '東北',
  [InsuranceRegion.KANTO]: '関東',
  [InsuranceRegion.CHUBU]: '中部',
  [InsuranceRegion.KANSAI]: '近畿',
  [InsuranceRegion.CHUGOKU]: '中国',
  [InsuranceRegion.SHIKOKU]: '四国',
  [InsuranceRegion.KYUSHU]: '九州'
};

/**
 * 協会けんぽの定数値
 */
export const KYOKAI_CONSTANTS = {
  careInsuranceRate: 1.60,         // 全国共通
  pensionInsuranceRate: 18.30,     // 全国共通
  employerBurden: 50,              // 労使折半
  employeeBurden: 50               // 労使折半
};

/**
 * 国共通の定数値
 */
export const INSURANCE_CONSTANTS = {
  pensionInsuranceRate: 18.30      // 厚生年金保険料率（全国共通・法定固定）
};

/**
 * 指定された都道府県のエリアを取得
 */
export function getRegionByPrefecture(prefecture: string): InsuranceRegion | null {
  for (const [region, prefectures] of Object.entries(REGION_PREFECTURE_MAP)) {
    if (prefectures.includes(prefecture)) {
      return region as InsuranceRegion;
    }
  }
  return null;
}

/**
 * 指定された都道府県の協会けんぽ料率を取得
 */
export function getKyokaiRateByPrefecture(prefecture: string): KyokaiRateData | null {
  return KYOKAI_RATES_DATA.find(rate => rate.prefecture === prefecture) || null;
}

/**
 * 指定されたエリアの都道府県一覧を取得
 */
export function getPrefecturesByRegion(region: InsuranceRegion): string[] {
  return REGION_PREFECTURE_MAP[region] || [];
}
