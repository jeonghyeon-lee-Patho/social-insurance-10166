/**
 * 社会保険適用基準（Insurance Standard）データモデル
 * 社員に適用される保険料額表および保険種別ごとの加入・免除ステータスを管理
 */

/**
 * 保険特例種別の列挙型
 */
export enum InsuranceExceptionType {
  NORMAL = 'normal',                                          // 通常
  FOREIGN_AGREEMENT_PENSION = 'foreign_agreement_pension',    // 外国人社会保障協定（年金免除のみ）
  FOREIGN_AGREEMENT_HEALTH = 'foreign_agreement_health',      // 外国人社会保障協定（健康保険免除のみ）
  FOREIGN_AGREEMENT_BOTH = 'foreign_agreement_both',          // 外国人社会保障協定（年金・健康両方免除）
  CHILDCARE_LEAVE_EXEMPTION = 'childcare_leave_exemption'     // 育児・産前産後休業免除
}

/**
 * 外国人社会保障協定における免除設定
 */
export interface ForeignAgreementSettings {
  pensionExempt: boolean;       // 厚生年金保険料免除（料率0%、0円固定）
  healthExempt: boolean;        // 健康保険料免除
  careExempt?: boolean;         // 介護保険料免除
}

/**
 * 社会保険適用基準マスタデータ（個別社員の履歴レコード）
 */
export interface InsuranceStandard {
  id: string;                                // ドキュメントID（Firestore）
  employeeId: string;                        // 社員ID（親レコード参照）
  
  // 適用期間
  effectiveStartYear: number;                // 適用開始年（YYYY）
  effectiveStartMonth: number;               // 適用開始月（1-12）
  effectiveEndYear?: number;                 // 適用終了年（YYYY）※未設定=継続中
  effectiveEndMonth?: number;                // 適用終了月（1-12）
  
  // 保険基準参照
  insuranceRateMasterId: string;             // 保険基準マスタID（保険料率の取得用）
  insuranceRateMasterName: string;           // 保険基準マスタ名称（表示用）
  
  // 特例・免除設定
  exceptionType: InsuranceExceptionType;     // 特例種別
  foreignAgreementSettings?: ForeignAgreementSettings;  // 外国人協定免除詳細（exceptionType が FOREIGN_* の場合）
  
  // メタデータ
  createdAt: string;                        // 作成日時（ISO 8601形式）
  updatedAt: string;                        // 更新日時（ISO 8601形式）
  createdBy: string;                        // 作成ユーザーID
  organizationId: string;                   // 所属組織ID（マルチテナント対応）
  isActive: boolean;                        // 有効フラグ
}

/**
 * 表示用ビューモデル（期間フォーマット済み）
 */
export interface InsuranceStandardView extends InsuranceStandard {
  effectivePeriod: string;                  // フォーマット済み期間表示（例: "2025/09 ~" または "2024/05 ~ 2025/08"）
  exceptionTypeLabel: string;               // 特例種別の日本語ラベル
}
