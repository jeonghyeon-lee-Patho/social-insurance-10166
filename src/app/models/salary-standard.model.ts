/**
 * 標準報酬月額（Salary Standard）データモデル
 * 給与等級履歴および賞与実績を管理
 */

/**
 * 報酬月額等級（1～50等級）
 * 厚生年金保険の標準報酬月額を計算するための等級
 */
export interface SalaryGrade {
  grade: number;                  // 等級番号（1～50）
  displayName: string;            // 表示名（例: "22(19)等級"）
  minimumSalary: number;          // 等級の下限額（円）
  maximumSalary: number;          // 等級の上限額（円）
  baseAmount: number;             // 標準報酬月額（円）
}


/**
 * 標準報酬月額（給与）履歴レコード
 */
export interface SalaryStandard {
  id: string;                                // ドキュメントID（Firestore）
  employeeId: string;                        // 社員ID（親レコード参照）
  
  // 適用期間
  effectiveStartYear: number;                // 適用開始年（YYYY）
  effectiveStartMonth: number;               // 適用開始月（1-12）
  effectiveEndYear?: number;                 // 適用終了年（YYYY）※未設定=継続中
  effectiveEndMonth?: number;                // 適用終了月（1-12）
  
  // 報酬額
  monthlyAmount: number;                     // 報酬月額（円）
  
  // 標準報酬等級情報
  salaryGradeId: string;                     // 報酬等級ID（マスタ参照）
  salaryGrade: number;                       // 報酬等級番号（1～51）
  salaryGradeDisplay: string;                // 報酬等級の表示名（例: "22(19)等級"）
  
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
export interface SalaryStandardView extends SalaryStandard {
  effectivePeriod: string;                  // フォーマット済み期間表示
  monthlyAmountDisplay: string;             // フォーマット済み金額表示（例: "310,000 円"）
}

/**
 * 標準報酬月額決定ロジック用の入力パラメータ
 */
export interface SalaryCalculationInput {
  monthlyAmount: number;          // 報酬月額（円）
  effectiveDate: Date;            // 適用開始日
  previousGrade?: number;         // 前回の等級（随時改定判定時に使用）
}

/**
 * 標準報酬月額決定の出力結果
 */
export interface SalaryCalculationResult {
  salaryGrade: number;            // 決定された等級（1～51）
  salaryGradeDisplay: string;     // 等級の表示名
  baseAmount: number;             // 標準報酬月額（円）
}
