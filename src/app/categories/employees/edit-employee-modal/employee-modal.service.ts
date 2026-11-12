import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, getDocs, query, where, deleteField, writeBatch } from '@angular/fire/firestore';
import { Employee, EmployeeView, Dependent } from '../../../models/employee.model';
import { InsuranceStandardView, InsuranceExceptionType, InsuranceStandard } from '../../../models/insurance-standard.model';
import { SalaryStandard, SalaryStandardView } from '../../../models/salary-standard.model';
import { BonusHistory, BonusHistoryView } from '../../../models/bonus-history.model';
import { InsuranceRateMaster } from '../../../models/insurance-rate.model';
import { calculateInsuranceEndYearMonth } from '../../../utils/insurance-calculator.util';
import { toEmployeeView } from '../../../utils/employee.util';

export interface SaveEmployeePayload {
  selectedEmployee: EmployeeView | null;
  currentUserUid: string;
  formValue: any;
  hasMissingHistory: boolean;
  hasIneligibleDependent: boolean;
  employeeAnnualIncome: number;
  dependents: Dependent[];
  hasPreviousInsurance: boolean;
  previousInsuranceAmount: number;
  insuranceStandardList: InsuranceStandardView[];
  salaryStandardList: SalaryStandardView[];
  bonusHistoryList: BonusHistoryView[];
}

@Injectable({
  providedIn: 'root'
})
export class EditEmployeeModalService {
  private firestore = inject(Firestore);

  async loadInsuranceRateMasters(orgId: string): Promise<InsuranceRateMaster[]> {
    const ratesRef = collection(this.firestore, 'insurance_rates');
    const q = query(ratesRef, where('organizationId', '==', orgId));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as InsuranceRateMaster))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async loadInsuranceStandards(employeeId: string, orgId: string): Promise<InsuranceStandardView[]> {
    const standardsRef = collection(this.firestore, 'insurance_standards');
    const q = query(standardsRef, where('organizationId', '==', orgId), where('employeeId', '==', employeeId));
    const snap = await getDocs(q);

    if (snap.empty) return [];

    return snap.docs.map(d => {
      const data = d.data() as InsuranceStandard;
      let effectivePeriod = `${data.effectiveStartYear}/${String(data.effectiveStartMonth).padStart(2, '0')}`;
      effectivePeriod += data.effectiveEndYear && data.effectiveEndMonth
        ? ` ~ ${data.effectiveEndYear}/${String(data.effectiveEndMonth).padStart(2, '0')}`
        : ' ~';

      let exceptionTypeLabel = '-';
      if (data.exceptionType === InsuranceExceptionType.CHILDCARE_LEAVE_EXEMPTION) {
        exceptionTypeLabel = '休業免除';
      } else if (
        data.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION ||
        data.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH ||
        data.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_BOTH
      ) {
        const p = data.foreignAgreementSettings ? data.foreignAgreementSettings.pensionExempt : (data.exceptionType !== InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH);
        const h = data.foreignAgreementSettings ? data.foreignAgreementSettings.healthExempt : (data.exceptionType !== InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION);
        if (p && h) exceptionTypeLabel = '協定(年・医)';
        else if (p) exceptionTypeLabel = '協定(年金)';
        else if (h) exceptionTypeLabel = '協定(医療)';
        else exceptionTypeLabel = '協定免除';
      }

      return {
        ...data,
        id: d.id,
        effectivePeriod,
        exceptionTypeLabel
      } as InsuranceStandardView;
    }).sort((a, b) => (b.effectiveStartYear * 100 + b.effectiveStartMonth) - (a.effectiveStartYear * 100 + a.effectiveStartMonth));
  }

  async loadSalaryStandards(employeeId: string, orgId: string): Promise<SalaryStandardView[]> {
    const salaryRef = collection(this.firestore, 'salary_standards');
    const q = query(salaryRef, where('organizationId', '==', orgId), where('employeeId', '==', employeeId));
    const snap = await getDocs(q);

    if (snap.empty) return [];

    return snap.docs.map(d => {
      const data = d.data() as SalaryStandard;
      let effectivePeriod = `${data.effectiveStartYear}/${String(data.effectiveStartMonth).padStart(2, '0')}`;
      effectivePeriod += data.effectiveEndYear && data.effectiveEndMonth
        ? ` ~ ${data.effectiveEndYear}/${String(data.effectiveEndMonth).padStart(2, '0')}`
        : ' ~';

      return {
        ...data,
        id: d.id,
        effectivePeriod,
        monthlyAmountDisplay: `${(data.monthlyAmount || 0).toLocaleString('ja-JP')} 円`
      } as SalaryStandardView;
    }).sort((a, b) => (b.effectiveStartYear * 100 + b.effectiveStartMonth) - (a.effectiveStartYear * 100 + a.effectiveStartMonth));
  }

  async loadBonusHistories(employeeId: string, orgId: string): Promise<BonusHistoryView[]> {
    const bonusRef = collection(this.firestore, 'bonus_histories');
    const q = query(bonusRef, where('organizationId', '==', orgId), where('employeeId', '==', employeeId));
    const snap = await getDocs(q);

    if (snap.empty) return [];

    return snap.docs.map(d => {
      const data = d.data() as BonusHistory;  
      return {
        ...data,
        id: d.id,
        paymentPeriod: `${data.paymentYear}/${String(data.paymentMonth).padStart(2, '0')}`,
        actualPaymentAmountDisplay: `${(data.actualPaymentAmount || 0).toLocaleString('ja-JP')} 円`,
        healthStandardBonusAmountDisplay: `${(data.healthStandardBonusAmount ?? data.standardBonusAmount ?? 0).toLocaleString('ja-JP')} 円`,
        pensionStandardBonusAmountDisplay: `${(data.pensionStandardBonusAmount ?? data.standardBonusAmount ?? 0).toLocaleString('ja-JP')} 円`
      } as BonusHistoryView;
    }).sort((a, b) => (b.paymentYear * 100 + b.paymentMonth) - (a.paymentYear * 100 + a.paymentMonth));
  }

  async isEmployeeNumberDuplicate(employeeNumber: string, orgId: string, currentEmployeeId?: string): Promise<boolean> {
    const trimmed = employeeNumber.trim();
    if (!trimmed) return false;

    const employeesRef = collection(this.firestore, 'employees');
    const q = query(employeesRef, where('organizationId', '==', orgId), where('employeeNumber', '==', trimmed));
    const snap = await getDocs(q);

    if (currentEmployeeId) {
      return snap.docs.some(d => d.id !== currentEmployeeId);
    }
    return snap.size > 0;
  }

  generateDefaultInsuranceStandard(hireDate: string, retirementDate: string | undefined, employeeId: string, orgId: string): InsuranceStandardView {
    const [hireY, hireM] = hireDate.split('-').map(Number);
    const endYM = calculateInsuranceEndYearMonth(retirementDate, hireDate);

    return {
      id: `insurance_${Date.now()}`,
      employeeId: employeeId || '',
      effectiveStartYear: hireY,
      effectiveStartMonth: hireM,
      effectiveEndYear: endYM?.year,
      effectiveEndMonth: endYM?.month,
      insuranceRateMasterId: 'N/A',
      insuranceRateMasterName: '対象外',
      exceptionType: InsuranceExceptionType.NORMAL,
      effectivePeriod: endYM
        ? `${hireY}/${String(hireM).padStart(2, '0')} ~ ${endYM.year}/${String(endYM.month).padStart(2, '0')}`
        : `${hireY}/${String(hireM).padStart(2, '0')} ~`,
      exceptionTypeLabel: '-',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: orgId,
      organizationId: orgId,
      isActive: true
    };
  }

  generateDefaultSalaryStandard(hireDate: string, retirementDate: string | undefined, employeeId: string, orgId: string): SalaryStandardView {
    const [hY, hM] = hireDate.split('-').map(Number);
    const hireYM = hY * 100 + hM;
    let endY = hM >= 6 ? hY + 1 : hY;
    let endM = 8;

    const endYM = calculateInsuranceEndYearMonth(retirementDate, hireDate);

    if (endYM) {
      const insEndYM = endYM.year * 100 + endYM.month;
      const defaultEndYM = endY * 100 + endM;
      if (insEndYM < defaultEndYM) {
        endY = endYM.year;
        endM = endYM.month;
      }
      if (endY * 100 + endM < hireYM) {
        endY = hY;
        endM = hM;
      }
    }

    return {
      id: `salary_${Date.now()}`,
      employeeId: employeeId || '',
      effectiveStartYear: hY,
      effectiveStartMonth: hM,
      effectiveEndYear: endY,
      effectiveEndMonth: endM,
      monthlyAmount: 0,
      salaryGradeId: 'grade_0',
      salaryGrade: 0,
      salaryGradeDisplay: '-',
      effectivePeriod: `${hY}/${String(hM).padStart(2, '0')} 〜 ${endY}/${String(endM).padStart(2, '0')}`,
      monthlyAmountDisplay: '0 円',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: orgId,
      organizationId: orgId,
      isActive: true
    };
  }

  async saveEmployeeAll(payload: SaveEmployeePayload): Promise<EmployeeView> {
    const {
      selectedEmployee,
      currentUserUid,
      formValue,
      hasMissingHistory,
      hasIneligibleDependent,
      employeeAnnualIncome,
      dependents,
      hasPreviousInsurance,
      previousInsuranceAmount,
      insuranceStandardList,
      salaryStandardList,
      bonusHistoryList
    } = payload;

    const now = new Date().toISOString();
    const batch = writeBatch(this.firestore);

    const employeeData: Record<string, any> = {
      employeeNumber: formValue.employeeNumber,
      nameKana: formValue.nameKana.trim(),
      dateOfBirth: formValue.dateOfBirth,
      hireDate: formValue.hireDate,
      hasMissingHistory,
      gender: formValue.gender || 'male',
      employmentType: formValue.employmentType || 'regular',
      employeeAnnualIncome,
      hasIneligibleDependent,
      dependents,
      hasPreviousInsurance,
      previousInsuranceAmount: hasPreviousInsurance ? (Number(previousInsuranceAmount) || 0) : 0,
      createdAt: selectedEmployee?.createdAt || now,
      updatedAt: now,
      createdBy: selectedEmployee?.createdBy || currentUserUid,
      organizationId: currentUserUid,
      isActive: true
    };

    const employeesRef = collection(this.firestore, 'employees');
    let savedEmployee: EmployeeView;
    let employeeId = selectedEmployee?.id;

    if (selectedEmployee) {
      employeeData['nameKanji'] = formValue.nameKanji?.trim() || deleteField();
      employeeData['nameRomaji'] = formValue.nameRomaji?.trim() || deleteField();
      employeeData['retirementDate'] = formValue.retirementDate || deleteField();
      employeeData['department'] = formValue.department?.trim() || deleteField();
      employeeData['position'] = formValue.position?.trim() || deleteField();
      employeeData['employmentInsuranceNumber'] = formValue.employmentInsuranceNumber?.trim() || deleteField();

      const employeeDocRef = doc(employeesRef, selectedEmployee.id);
      batch.set(employeeDocRef, employeeData, { merge: true });

      savedEmployee = toEmployeeView({
        ...selectedEmployee,
        employeeNumber: formValue.employeeNumber,
        nameKana: formValue.nameKana.trim(),
        nameKanji: formValue.nameKanji?.trim() || undefined,
        nameRomaji: formValue.nameRomaji?.trim() || undefined,
        dateOfBirth: formValue.dateOfBirth,
        hireDate: formValue.hireDate,
        retirementDate: formValue.retirementDate || undefined,
        hasMissingHistory,

        gender: formValue.gender || 'male',
        employmentType: formValue.employmentType || 'regular',
        department: formValue.department?.trim() || undefined,
        position: formValue.position?.trim() || undefined,
        employmentInsuranceNumber: formValue.employmentInsuranceNumber?.trim() || undefined,

        employeeAnnualIncome,
        hasIneligibleDependent,
        dependents,
        hasPreviousInsurance,
        previousInsuranceAmount: hasPreviousInsurance ? (Number(previousInsuranceAmount) || 0) : 0,
        updatedAt: now,
      } as Employee);
    } else {
      if (formValue.nameKanji?.trim()) employeeData['nameKanji'] = formValue.nameKanji.trim();
      if (formValue.nameRomaji?.trim()) employeeData['nameRomaji'] = formValue.nameRomaji.trim();
      if (formValue.retirementDate) employeeData['retirementDate'] = formValue.retirementDate;
      if (formValue.department?.trim()) employeeData['department'] = formValue.department.trim();
      if (formValue.position?.trim()) employeeData['position'] = formValue.position.trim();
      if (formValue.employmentInsuranceNumber?.trim()) employeeData['employmentInsuranceNumber'] = formValue.employmentInsuranceNumber.trim();

      const newDocRef = doc(employeesRef);
      batch.set(newDocRef, employeeData);

      employeeId = newDocRef.id;
      savedEmployee = toEmployeeView({
        id: employeeId,
        ...employeeData,
        nameKanji: formValue.nameKanji?.trim() || undefined,
        nameRomaji: formValue.nameRomaji?.trim() || undefined,
        retirementDate: formValue.retirementDate || undefined,
        department: formValue.department?.trim() || undefined,
        position: formValue.position?.trim() || undefined,
        employmentInsuranceNumber: formValue.employmentInsuranceNumber?.trim() || undefined,
      } as Employee);
    }

    // 1. 保険基準の保存・削除
    const standardsRef = collection(this.firestore, 'insurance_standards');
    if (selectedEmployee && employeeId) {
      const snap = await getDocs(query(standardsRef, where('organizationId', '==', currentUserUid), where('employeeId', '==', employeeId)));
      const currentIds = new Set(insuranceStandardList.map(s => s.id));
      for (const d of snap.docs) {
        if (!currentIds.has(d.id)) batch.delete(d.ref);
      }
    }
    for (const s of insuranceStandardList) {
      const ref = s.id ? doc(standardsRef, s.id) : doc(standardsRef);
      s.id = ref.id;

      const data: Record<string, any> = {
        id: ref.id,
        employeeId: employeeId!,
        effectiveStartYear: s.effectiveStartYear,
        effectiveStartMonth: s.effectiveStartMonth,
        insuranceRateMasterId: s.insuranceRateMasterId || 'N/A',
        insuranceRateMasterName: s.insuranceRateMasterName || '対象外',
        exceptionType: s.exceptionType || InsuranceExceptionType.NORMAL,
        foreignAgreementSettings: s.foreignAgreementSettings || deleteField(),
        createdAt: s.createdAt || now,
        updatedAt: now,
        createdBy: s.createdBy || currentUserUid,
        organizationId: currentUserUid,
        isActive: true,
        effectiveEndYear: s.effectiveEndYear || deleteField(),
        effectiveEndMonth: s.effectiveEndMonth || deleteField()
      };
      batch.set(ref, data, { merge: true });
    }

    // 2. 報酬月額の保存・削除
    const salaryRef = collection(this.firestore, 'salary_standards');
    if (selectedEmployee && employeeId) {
      const snap = await getDocs(query(salaryRef, where('organizationId', '==', currentUserUid), where('employeeId', '==', employeeId)));
      const currentIds = new Set(salaryStandardList.map(s => s.id));
      for (const d of snap.docs) {
        if (!currentIds.has(d.id)) batch.delete(d.ref);
      }
    }
    for (const s of salaryStandardList) {
      const ref = s.id ? doc(salaryRef, s.id) : doc(salaryRef);
      s.id = ref.id;

      const data: Record<string, any> = {
        id: ref.id,
        employeeId: employeeId!,
        effectiveStartYear: s.effectiveStartYear,
        effectiveStartMonth: s.effectiveStartMonth,
        monthlyAmount: s.monthlyAmount,
        salaryGradeId: s.salaryGradeId || `grade_${s.salaryGrade}`,
        salaryGrade: s.salaryGrade,
        salaryGradeDisplay: s.salaryGradeDisplay,
        createdAt: s.createdAt || now,
        updatedAt: now,
        createdBy: s.createdBy || currentUserUid,
        organizationId: currentUserUid,
        isActive: true,
        effectiveEndYear: s.effectiveEndYear || deleteField(),
        effectiveEndMonth: s.effectiveEndMonth || deleteField()
      };
      batch.set(ref, data, { merge: true });
    }

    // 3. 賞与履歴の保存・削除
    const bonusRef = collection(this.firestore, 'bonus_histories');
    if (selectedEmployee && employeeId) {
      const snap = await getDocs(query(bonusRef, where('organizationId', '==', currentUserUid), where('employeeId', '==', employeeId)));
      const currentIds = new Set(bonusHistoryList.map(b => b.id));
      for (const d of snap.docs) {
        if (!currentIds.has(d.id)) batch.delete(d.ref);
      }
    }
    for (const b of bonusHistoryList) {
      const ref = b.id ? doc(bonusRef, b.id) : doc(bonusRef);
      b.id = ref.id;

      const data: Record<string, any> = {
        id: ref.id,
        employeeId: employeeId!,
        paymentYear: b.paymentYear,
        paymentMonth: b.paymentMonth,
        actualPaymentAmount: b.actualPaymentAmount,
        healthStandardBonusAmount: b.healthStandardBonusAmount ?? b.standardBonusAmount ?? 0,
        pensionStandardBonusAmount: b.pensionStandardBonusAmount ?? b.standardBonusAmount ?? 0,
        createdAt: b.createdAt || now,
        updatedAt: now,
        createdBy: b.createdBy || currentUserUid,
        organizationId: currentUserUid,
        isActive: true,
        notes: b.notes || deleteField()
      };
      batch.set(ref, data, { merge: true });
    }

    await batch.commit();
    return savedEmployee;
  }
}

