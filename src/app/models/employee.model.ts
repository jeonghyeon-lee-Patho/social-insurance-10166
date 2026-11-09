/**
 * 社員（Employee）データモデル
 */

/**
 * 在籍ステータスの列挙型
 */
export enum EmploymentStatus {
  ACTIVE = 'active',       // 在籍者
  UPCOMING = 'upcoming',   // 将来在籍者
  RETIRED = 'retired'      // 退職者
}

/**
 * 報酬月額履歴の単位インターフェース
 */
export interface SalaryHistory {
  year: number;            // 年（YYYY）
  month: number;           // 月（1-12）
  standardMonthlyAmount: number; // 標準報酬月額
}

export type DependentRelationship = 'spouse' | 'child' | 'parent' | 'sibling' | 'other';

export interface Dependent {
  id: string;
  name: string;
  relationship: DependentRelationship;
  dateOfBirth: string;
  isLivingTogether: boolean;
  expectedAnnualIncome: number;
  remittanceAmount?: number;
  isDisability?: boolean;
}

/**
 * 社員マスタデータ
 */
export interface Employee {
  id: string;                              // ドキュメントID（Firestore）
  employeeNumber: string;                  // 社員番号（企業内の固有識別コード）
  employmentStatus: EmploymentStatus;      // 在籍ステータス

  // 基本情報（ステップ1）
  nameKanji?: string;                      // 氏名（漢字）
  nameKana: string;                        // 氏名（カナ）
  nameRomaji?: string;                     // 氏名（英字/ローマ字）
  dateOfBirth: string;                     // 生年月日（ISO 8601形式: YYYY-MM-DD）
  hireDate: string;                        // 入社年月日（ISO 8601形式: YYYY-MM-DD）
  retirementDate?: string;                 // 退職年月日（ISO 8601形式: YYYY-MM-DD）
  hasMissingHistory?: boolean;             // 報酬月額未入力期間があるかどうか
  
  // 追加人事属性（ステップ1）
  gender?: 'male' | 'female';
  employmentType?: 'regular' | 'contract' | 'partTime' | 'executive';
  department?: string;
  position?: string;
  employmentInsuranceNumber?: string;
 
  // 扶養家族情報（ステップ1）
  employeeAnnualIncome?: number;
  hasIneligibleDependent?: boolean;
  dependents?: Dependent[];
    
  // 報酬・賞与・保険履歴（ステップ2）
  insuranceStandardIds?: string[];         // 社会保険適用基準ID（履歴レコード）
  salaryStandardIds?: string[];            // 標準報酬月額ID（履歴レコード）
  bonusHistoryIds?: string[];              // 賞与履歴ID（レコード）
  
  // ※個別の履歴レコードはサブコレクションまたは別コレクションで管理
  salaryHistories?: SalaryHistory[];       // 報酬月額履歴（レガシー用途）
  
  // メタデータ
  createdAt: string;                       // 作成日時（ISO 8601形式）
  updatedAt: string;                       // 更新日時（ISO 8601形式）
  createdBy: string;                       // 作成ユーザーID
  organizationId: string;                  // 所属組織ID（マルチテナント対応）
  isActive: boolean;                       // 有効フラグ
}

/**
 * 社員一覧表示用のビューモデル（計算済みのプロパティを含む）
 */
export interface EmployeeView extends Employee {
  displayName: string;                     // 表示用氏名（優先順位: 漢字 > 英字 > カナ）
  age: number;                             // 満年齢
  hasMissingHistory: boolean;              // 報酬月額未入力期間があるかどうか
  hasIneligibleDependent: boolean;
  dependents: Dependent[];
}




