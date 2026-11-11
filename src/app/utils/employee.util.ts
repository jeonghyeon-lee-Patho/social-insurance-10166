import { Employee, EmployeeView, Dependent, DependentRelationship } from '../models/employee.model';
import { calculateInsuranceEndYearMonth } from './insurance-calculator.util';
import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * 入社月から現在（または退職月）までの間に給与履歴の抜け漏れがあるか判定
 * ※ 入社予定者は対象外（false）
 */
export function checkSalaryHistoryGaps(
  hireDate: string,
  retirementDate: string = '',
  salaryStandards: Array<{
    effectiveStartYear: number;
    effectiveStartMonth: number;
    effectiveEndYear?: number;
    effectiveEndMonth?: number;
    monthlyAmount?: number;
  }>
): boolean {
  if (!hireDate) return false;

  const [hY, hM] = hireDate.split('-').map(Number);
  const hireYM = hY * 100 + hM;

  const today = new Date();
  const todayYM = today.getFullYear() * 100 + (today.getMonth() + 1);

  // 1. 入社予定者は判定対象外
  if (hireYM > todayYM) {
    return false;
  }

  // 2. 判定終了月（退職者の場合は喪失月と現在の早い方）
  let endYM = todayYM;
  if (retirementDate) {
    const endInsurance = calculateInsuranceEndYearMonth(retirementDate, hireDate);
    if (endInsurance) {
      const retireYM = endInsurance.year * 100 + endInsurance.month;
      endYM = Math.min(todayYM, retireYM);
    }
  }

  if (endYM < hireYM) return false;

  // 3. 履歴が1件も存在しない場合は漏れあり
  if (!salaryStandards || salaryStandards.length === 0) {
    return true;
  }

  // 4. 入社月から終了月まで1ヶ月ずつ網羅性をチェック
  let currY = hY;
  let currM = hM;

  while (currY * 100 + currM <= endYM) {
    const targetYM = currY * 100 + currM;

    const isCovered = salaryStandards.some(s => {
      const hasValidAmount = (Number(s.monthlyAmount) || 0) > 0;
      const sStart = Number(s.effectiveStartYear) * 100 + Number(s.effectiveStartMonth);
      const sEnd = (s.effectiveEndYear && s.effectiveEndMonth)
        ? Number(s.effectiveEndYear) * 100 + Number(s.effectiveEndMonth)
        : 999999;
      return hasValidAmount && sStart <= targetYM && targetYM <= sEnd;
    });

    if (!isCovered) {
      return true;
    }

    currM++;
    if (currM > 12) {
      currM = 1;
      currY++;
    }
  }

  return false;
}

/* ひらがなをカタカナに変換*/
function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, char => String.fromCharCode(char.charCodeAt(0) + 0x60));
}

/* 検索対象テキストを正規化*/
function normalizeSearchTarget(text: string): string {
  return hiraganaToKatakana(text.toLowerCase().replace(/[\s\u3000]+/g, ''));
}

/* 今日の日付文字列（YYYY-MM-DD形式）を取得*/
export function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 満年齢を計算
 */
export function calculateAge(dateOfBirth: string): number {
  if (!dateOfBirth) return 0;
  const [bYear, bMonth, bDay] = dateOfBirth.split('-').map(Number);
  if (!bYear || !bMonth || !bDay) return 0;

  const now = new Date();
  let age = now.getFullYear() - bYear;
  const monthDiff = (now.getMonth() + 1) - bMonth;

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < bDay)) {
    age--;
  }
  return age;
}

/* 表示用氏名を取得（優先順位: 漢字 > 英字 > カナ）*/
export function getDisplayName(employee: Employee): string {
  return employee.nameKanji || employee.nameRomaji || employee.nameKana || '名前未設定';
}


export function checkDependentEligibility(
  dep: Dependent,
  employeeAnnualIncome: number,
): { isHealthEligible: boolean; isPension3Eligible: boolean } {
  const age = calculateAge(dep.dateOfBirth);

  if (age >= 75) {
    return { isHealthEligible: false, isPension3Eligible: false };
  }

  if (dep.relationship === 'other' && !dep.isLivingTogether) {
    return { isHealthEligible: false, isPension3Eligible: false };
  }

  const incomeLimit = (age >= 60 || dep.isDisability) ? 1800000 : 1300000;
  const depIncome = Number(dep.expectedAnnualIncome) || 0;
  let isHealthEligible = depIncome < incomeLimit;

  if (isHealthEligible) {
    const empIncome = Number(employeeAnnualIncome) || 0;

    if (dep.isLivingTogether) {
      if (depIncome > 0 && (depIncome * 2 >= empIncome)) {
        isHealthEligible = false;
      }
    } else {
      const remittance = Number(dep.remittanceAmount) || 0;
      if (depIncome >= remittance || remittance === 0) {
        isHealthEligible = false;
      }
    }
  }

  const isPension3Eligible = dep.relationship === 'spouse' && isHealthEligible && age >= 20 && age < 60;

  return { isHealthEligible, isPension3Eligible };
}

export function getRelationshipLabel(rel: DependentRelationship): string {
  switch (rel) {
    case 'spouse': return '配偶者';
    case 'child': return '子・孫';
    case 'parent': return '父母・祖父母';
    case 'sibling': return '兄弟姉妹';
    case 'other': return 'その他親族';
    default: return '-';
  }
}

/**
 * Employee を EmployeeView に変換
 */
export function toEmployeeView(employee: Employee): EmployeeView {
  return {
    ...employee,
    displayName: getDisplayName(employee),
    age: calculateAge(employee.dateOfBirth),
    hasMissingHistory: employee.hasMissingHistory ?? false,
    hasIneligibleDependent: employee.hasIneligibleDependent ?? false,
    hasPreviousInsurance: employee.hasPreviousInsurance ?? false,
    previousInsuranceAmount: employee.previousInsuranceAmount ?? 0,
    dependents: employee.dependents ? [...employee.dependents] : []
  };
}

/**
 * Employee の配列を EmployeeView の配列に変換
 */
export function toEmployeeViews(employees: Employee[]): EmployeeView[] {
  return employees.map(toEmployeeView);
}

/**
 * 在籍予定者（入社年月日が今日より未来）かどうかを判定
 */
export function isUpcoming(employee: Employee): boolean {
  if (!employee.hireDate) return false;
  return employee.hireDate > getTodayString();
}

/**
 * 退職済み（退職年月日が今日より過去）かどうかを判定
 */
export function isRetired(employee: Employee): boolean {
  if (!employee.retirementDate) return false;
  return employee.retirementDate < getTodayString();
}

/**
 * 現在在籍中（入社日到来済み、かつ退職していない）かどうかを判定
 */
export function isActive(employee: Employee): boolean {
  return !isUpcoming(employee) && !isRetired(employee);
}

/**
 * 在籍ステータスフィルター
 */
export function filterByStatus(
  employees: EmployeeView[],
  status: 'all' | 'active' | 'upcoming' | 'retired'
): EmployeeView[] {
  if (status === 'all') return employees;
  if (status === 'active') return employees.filter(isActive);
  if (status === 'upcoming') return employees.filter(isUpcoming);
  if (status === 'retired') return employees.filter(isRetired);
  return employees;
}

/**
 * テキスト検索フィルター（氏名、社員番号）
 * 検索対象: displayName（表示名）、nameKanji（漢字名）、nameKana（カタカナ名）、nameRomaji（英字名）、employeeNumber（社員番号）
 * ひらがな↔カタカナ相互検索対応
 */
export function filterBySearch(employees: EmployeeView[], searchText: string): EmployeeView[] {
  if (!searchText.trim()) return employees;

  const normalizedSearchText = normalizeSearchTarget(searchText);

  return employees.filter(e => {
    const searchTargets = [
      e.displayName || '',
      e.nameKanji || '',
      e.nameKana || '',
      e.nameRomaji || '',
      e.employeeNumber || '',
      e.department || '',
      e.position || '',
    ];

    return searchTargets.some(target => {
      const normalizedTarget = normalizeSearchTarget(target);
      return normalizedTarget.includes(normalizedSearchText);
    });
  });
}

export function formatDate(dateString: string): string {
  if (!dateString) return '';
  const cleanDate = dateString.split('T')[0].replace(/\//g, '-');
  const [y, m, d] = cleanDate.split('-');

  if (!y || !m || !d) return dateString;
  return `${y}/${m.padStart(2, '0')}/${d.padStart(2, '0')}`;
}


export function getDaysList(year: number | '', month: number | '', fallbackYear: number = new Date().getFullYear()): number[] {
  const y = Number(year) || fallbackYear;
  const m = Number(month) || 1;
  const maxDay = new Date(y, m, 0).getDate();
  return Array.from({ length: maxDay }, (_, i) => i + 1);
}

export function katakanaValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const regex = /^[\u30A0-\u30FF\u3099-\u309C\s\-]*$/;
  return regex.test(control.value) ? null : { invalidKana: true };
}

export function kanjiValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const regex = /^[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\u30FC\u3005\u3007\s]+$/;
  return regex.test(control.value) ? null : { invalidKanji: true };
}

export function romajiValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const regex = /^[A-Za-z\s\-]*$/;
  return regex.test(control.value) ? null : { invalidRomaji: true };
}

/**
 * 雇用保険被保険者番号バリデータ (任意入力、入力時のみ4桁-6桁-1桁または11桁数値を検証)
 * 例: 1234-567890-1 または 12345678901
 */
export function employmentInsuranceValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value?.trim();
  if (!value) return null;

  const regex = /^(\d{4}-\d{6}-\d{1}|\d{11})$/;
  return regex.test(value) ? null : { invalidEmploymentInsurance: true };
}

export function setControlSpecificError(control: AbstractControl | null, errorKey: string, hasError: boolean) {
  if (!control) return;
  const currentErrors = control.errors ? { ...control.errors } : null;

  if (hasError) {
    control.setErrors({ ...currentErrors, [errorKey]: true });
  } else if (currentErrors && currentErrors[errorKey]) {
    delete currentErrors[errorKey];
    control.setErrors(Object.keys(currentErrors).length > 0 ? currentErrors : null);
  }
}

/**
 * 3連セレクトボックス（年・月・日）の変更を共通処理するヘルパー
 */
export function resolveDateParts(
  year: number | '',
  month: number | '',
  day: number | '',
): { days: number[]; correctedDay: number | ''; dateString: string } {
  const days = getDaysList(year, month);
  let correctedDay = day;

  if (Number(day) > days.length) {
    correctedDay = days.length;
  }

  const dateString = (year && month && correctedDay)
    ? `${year}-${String(month).padStart(2, '0')}-${String(correctedDay).padStart(2, '0')}`
    : '';

  return { days, correctedDay, dateString };
}

