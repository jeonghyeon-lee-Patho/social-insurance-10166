/**
 * 保険基準（Insurance Rates）データモデル
 */

/**
 * 保険種類の列挙型
 */
export enum InsuranceType {
  KYOKAI = 'kyokai',            // 協会けんぽ
  KUMIAI = 'kumiai'             // 組合健保
}

/**
 * 地域（エリア）の列挙型
 */
export enum InsuranceRegion {
  HOKKAIDO = 'hokkaido',         // 北海道
  TOHOKU = 'tohoku',             // 東北
  KANTO = 'kanto',               // 関東
  CHUBU = 'chubu',               // 中部
  KANSAI = 'kansai',             // 近畿
  CHUGOKU = 'chugoku',           // 中国
  SHIKOKU = 'shikoku',           // 四国
  KYUSHU = 'kyushu'              // 九州
}

/**
 * 協会けんぽの地域別健康保険料率（2024年度）
 * 労使折半（各50%）
 */
export interface KyokaiRateData {
  region: InsuranceRegion;
  prefecture: string;
  healthInsuranceRate: number;     // 健康保険料率（%）
  careInsuranceRate: number;       // 介護保険料率（%）
  pensionInsuranceRate: number;    // 厚生年金保険料率（%）
  employerBurden: number;          // 会社負担割合（%）
  employeeBurden: number;          // 従業員負担割合（%）
}

/**
 * 労使負担割合
 */
export interface BurdenRatio {
  employee: number;               // 従業員負担割合（%）
  employer: number;               // 会社負担割合（%）
}

/**
 * 保険料率情報
 */
export interface InsuranceRates {
  healthInsurance: number;         // 健康保険料率（%）
  careInsurance: number;           // 介護保険料率（%）
  pensionInsurance: number;        // 厚生年金保険料率（%）
}

/**
 * 保険基準マスタデータ
 */
export interface InsuranceRateMaster {
  id: string;                      // ドキュメントID（Firestore）
  name: string;                    // 基準名称（最大20文字）
  type: InsuranceType;             // 保険種類（協会けんぽ / 組合健保）
  
  // 協会けんぽの場合
  region?: InsuranceRegion;        // 地域（エリア）
  prefecture?: string;             // 都道府県名
  
  // 全共通
  rates: InsuranceRates;           // 保険料率
  burdenRatio: BurdenRatio;        // 健康保険の労使負担
  burdenRatioCare?: BurdenRatio;   // 介護保険の労使負担
  
  // 適用人数
  applicableEmployeeCount: number; // 適用人数
  
  // メタデータ
  createdAt: string;               // 作成日時（ISO 8601形式）
  updatedAt: string;               // 更新日時（ISO 8601形式）
  createdBy: string;               // 作成ユーザーID
  organizationId: string;          // 所属組織ID（マルチテナント対応）
  isActive: boolean;               // 有効フラグ
}


