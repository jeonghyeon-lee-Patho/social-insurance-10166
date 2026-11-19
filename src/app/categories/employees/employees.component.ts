import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, ChangeDetectorRef, OnDestroy } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { EditEmployeeModalComponent } from "./edit-employee-modal/edit-employee-modal.component";
import { Auth, authState, User } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs, doc, writeBatch, getDoc, setDoc, deleteField } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { Employee, EmployeeView } from '../../models/employee.model';
import {
  toEmployeeViews,
  filterByStatus,
  filterBySearch,
  formatDate,
  checkSalaryHistoryGaps,
} from '../../utils/employee.util';

export type SortKey = 'employeeNumber' | 'name' | 'age' | 'hireDate';
export type SortDirection = 'asc' | 'desc';
export type StatusFilterType = 'all' | 'active' | 'upcoming' | 'retired';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, EditEmployeeModalComponent],
  templateUrl: './employees.component.html',
  styleUrl: './employees.component.css'
})
export class EmployeesComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  employees: EmployeeView[] = [];
  filteredEmployees: EmployeeView[] = [];

  // 集計開始年月（システム導入基準月）設定
  systemStartYM: number | null = null;
  isEditingSystemStart = false;
  selectedSystemStartYear: number | '' = '';
  selectedSystemStartMonth: number | '' = '';
  systemStartYears: number[] = [];
  systemStartMonths = Array.from({ length: 12 }, (_, i) => i + 1);
  isUpdatingSystemStart = false;

  // フィルター・検索・ソート条件
  searchText = '';
  statusFilter: StatusFilterType = 'active';
  sortKey: SortKey = 'employeeNumber';
  sortDirection: SortDirection = 'asc';

  // UI状態
  showEditModal = false;
  selectedEmployee: EmployeeView | null = null;
  isLoading = false;

  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private cdr = inject(ChangeDetectorRef);
  private authSubscription?: Subscription;

  constructor() {
    const currYear = new Date().getFullYear();
    for (let y = currYear + 1; y >= 2000; y--) {
      this.systemStartYears.push(y);
    }
  }

  ngOnInit() {
    this.authSubscription = authState(this.auth).subscribe(user => {
      if (user) {
        this.currentUser = user;
        this.loadEmployees();
      } else {
        this.currentUser = null;
        this.employees = [];
        this.filteredEmployees = [];
      }
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }

  /**
   * Firestoreから社員情報一覧を読み込む
   */
  async loadEmployees() {
    if (!this.currentUser) return;

    this.isLoading = true;
    try {
      const orgId = this.currentUser.uid;
      const userDocRef = doc(this.firestore, 'social_users', orgId);
      const employeesRef = collection(this.firestore, 'employees');
      const q = query(employeesRef, where('organizationId', '==', orgId));
      
      const [userDocSnap, querySnapshot] = await Promise.all([
        getDoc(userDocRef),
        getDocs(q)
      ]);

      const rawStartYM = userDocSnap.exists() ? userDocSnap.data()['systemStartYM'] : null;
      this.systemStartYM = (typeof rawStartYM === 'number' && rawStartYM > 0) ? rawStartYM : null;
      
      const employeeList = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }) as Employee);

      this.employees = toEmployeeViews(employeeList);
      this.applyFiltersAndSort();
    } catch (error) {
      console.error('社員情報の読み込みに失敗しました:', error);
      alert('社員情報の読み込みに失敗しました。');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * フィルターとソートを適用
   */
  applyFiltersAndSort() {
    let filtered = [...this.employees];
    filtered = filterByStatus(filtered, this.statusFilter);
    filtered = filterBySearch(filtered, this.searchText);
    filtered = this.sortEmployeeList(filtered, this.sortKey, this.sortDirection);

    this.filteredEmployees = filtered;
    this.cdr.detectChanges();
  }

  /**
   * 社員一覧のソート処理（社員番号、氏名、年齢、入社年月日）
   */
  private sortEmployeeList(list: EmployeeView[], key: SortKey, direction: SortDirection): EmployeeView[] {
    const factor = direction === 'asc' ? 1 : -1;

    const tieBreaker = (a: EmployeeView, b: EmployeeView) => {
      return (a.employeeNumber ?? '').localeCompare(b.employeeNumber ?? '', 'ja', { numeric: true });
    };

    return [...list].sort((a, b) => {
      let diff = 0;

      switch (key) {
        case 'employeeNumber':
          diff = (a.employeeNumber ?? '').localeCompare(b.employeeNumber ?? '', 'ja', { numeric: true });
          break;
        case 'name':
          diff = (a.nameKana ?? '').localeCompare(b.nameKana ?? '', 'ja');
          break;
        case 'age': {
          const timeA = a.dateOfBirth ? new Date(a.dateOfBirth).getTime() : 0;
          const timeB = b.dateOfBirth ? new Date(b.dateOfBirth).getTime() : 0;
          diff = timeB - timeA;
          break;
        }
        case 'hireDate': {
          const timeA = a.hireDate ? new Date(a.hireDate).getTime() : 0;
          const timeB = b.hireDate ? new Date(b.hireDate).getTime() : 0;
          diff = timeA - timeB;
          break;
        }
        default:
          diff = 0;
      }

      if (diff !== 0) return diff * factor;
      return tieBreaker(a, b);
    });
  }

  /**
   * 検索テキスト変更時のハンドラー
   */
  onSearchInput(event: Event) {
    this.searchText = (event.target as HTMLInputElement).value;
    this.applyFiltersAndSort();
  }

  /**
   * 在籍ステータスフィルター変更時のハンドラー
   */
  onStatusFilterChange() {
    this.applyFiltersAndSort();
  }

  /**
   * ソート順序変更時のハンドラー
   */
  onSortChange() {
    this.applyFiltersAndSort();
  }

  /**
   * 社員追加ボタン押下時のハンドラー
   */
  openAddEmployeeModal() {
    this.selectedEmployee = null;
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  /**
   * 社員行クリック時またはログ編集ボタン押下時のハンドラー
   */
  openEditEmployeeModal(employee: EmployeeView) {
    this.selectedEmployee = employee;
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  /**
   * 編集モーダルを閉じる
   */
  closeEditModal() {
    this.showEditModal = false;
    this.selectedEmployee = null;
    this.cdr.detectChanges();
  }

  /**
   * 社員が保存された時の処理
   */
  async onEmployeeSaved(savedEmployee: EmployeeView) {
    this.closeEditModal();

    const index = this.employees.findIndex(e => e.id === savedEmployee.id);
    if (index !== -1) {
      this.employees[index] = savedEmployee;
    } else {
      this.employees.unshift(savedEmployee);
    }

    this.applyFiltersAndSort();
  }

  /**
   * 社員を削除する
   */
  async deleteEmployee(employee: EmployeeView) {
    if (!this.currentUser) return;
    // 確認ダイアログ
    const confirmMessage = `※すでに給与および社会保険計算の実績が存在する場合、データの不整合が発生する可能性があります。
    退職した社員の場合は削除せず、『退職年月日』を入力してください。
    
    「${employee.displayName}」を削除してもよろしいですか？（関連する保険・給与・賞与履歴もすべて削除されます）`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const batch = writeBatch(this.firestore);

      // 1. 社員ドキュメントの削除予約
      const employeeDocRef = doc(this.firestore, 'employees', employee.id);
      batch.delete(employeeDocRef);

      // 2. 社会保険適用基準の削除予約
      const insQuery = query(
        collection(this.firestore, 'insurance_standards'),
        where('organizationId', '==', this.currentUser?.uid),
        where('employeeId', '==', employee.id)
      )
      const insSnap = await getDocs(insQuery);
      insSnap.docs.forEach(d => batch.delete(d.ref));

      // 3. 標準報酬月額（給与）履歴の削除予約
      const salQuery = query(
        collection(this.firestore, 'salary_standards'),
        where('organizationId', '==', this.currentUser?.uid),
        where('employeeId', '==', employee.id)
      );
      const salSnap = await getDocs(salQuery);
      salSnap.docs.forEach(d => batch.delete(d.ref));

      // 4. 賞与支給実績の削除予約
      const bonusQuery = query(
        collection(this.firestore, 'bonus_histories'),
        where('organizationId', '==', this.currentUser?.uid),
        where('employeeId', '==', employee.id)
      );
      const bonusSnap = await getDocs(bonusQuery);
      bonusSnap.docs.forEach(d => batch.delete(d.ref));

      await batch.commit();

      this.employees = this.employees.filter(e => e.id !== employee.id);
      this.applyFiltersAndSort();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('社員の削除に失敗しました:', error);
      alert('削除に失敗しました。');
    }
  }

  getRowClass(employee: EmployeeView): string {
    if (employee.hasMissingHistory) {
      return 'warning-highlight';
    }
    return '';
  }

  /**
   * 日付をフォーマット（テンプレート用）
   */
  formatDate(dateString: string): string {
    return formatDate(dateString);
  }

  get systemStartYMDisplay(): string {
    if (!this.systemStartYM) return '未設定（入社月から）';
    const y = Math.floor(this.systemStartYM / 100);
    const m = this.systemStartYM % 100;
    return `${y}/${String(m).padStart(2, '0')}〜`;
  }

  openSystemStartEditor() {
    if (this.systemStartYM) {
      this.selectedSystemStartYear = Math.floor(this.systemStartYM / 100);
      this.selectedSystemStartMonth = this.systemStartYM % 100;
    } else {
      this.selectedSystemStartYear = new Date().getFullYear();
      this.selectedSystemStartMonth = 4;
    }
    this.isEditingSystemStart = true;
    this.cdr.detectChanges();
  }

  cancelSystemStartEditor() {
    this.isEditingSystemStart = false;
    this.cdr.detectChanges();
  }

  async saveSystemStartYM(clearSetting: boolean = false) {
    if (!this.currentUser || this.isUpdatingSystemStart) return;

    let newYM: number | null = null;
    if (!clearSetting) {
      if (!this.selectedSystemStartYear || !this.selectedSystemStartMonth) {
        alert('年と月を選択してください。');
        return;
      }
      newYM = Number(this.selectedSystemStartYear) * 100 + Number(this.selectedSystemStartMonth);
    }

    this.isUpdatingSystemStart = true;
    this.cdr.detectChanges();

    try {
      const orgId = this.currentUser.uid;
      const userDocRef = doc(this.firestore, 'social_users', orgId);

      // 1. 事業所の集計開始年月を保存（解除時はフィールド削除）
      await setDoc(
        userDocRef,
        { systemStartYM: newYM ? newYM : deleteField() },
        { merge: true }
      );
      this.systemStartYM = newYM;

      // 2. 全社員の未入力フラグ（hasMissingHistory）を一括再計算
      const [salSnap, insSnap] = await Promise.all([
        getDocs(query(collection(this.firestore, 'salary_standards'), where('organizationId', '==', orgId))),
        getDocs(query(collection(this.firestore, 'insurance_standards'), where('organizationId', '==', orgId)))
      ]);

      const salMap: Record<string, any[]> = {};
      salSnap.docs.forEach(d => {
        const data = d.data();
        const empId = data['employeeId'];
        if (empId) (salMap[empId] ??= []).push(data);
      });

      const insMap: Record<string, any[]> = {};
      insSnap.docs.forEach(d => {
        const data = d.data();
        const empId = data['employeeId'];
        if (empId) (insMap[empId] ??= []).push(data);
      });

      const batch = writeBatch(this.firestore);
      let hasChanges = false;

      this.employees = this.employees.map(emp => {
        const updatedMissing = checkSalaryHistoryGaps(
          emp.hireDate,
          emp.retirementDate,
          salMap[emp.id] || [],
          insMap[emp.id] || [],
          newYM
        );
        if (emp.hasMissingHistory !== updatedMissing) {
          hasChanges = true;
          batch.update(doc(this.firestore, 'employees', emp.id), { hasMissingHistory: updatedMissing });
        }
        return { ...emp, hasMissingHistory: updatedMissing };
      });

      if (hasChanges) {
        await batch.commit();
      }

      this.isEditingSystemStart = false;
      this.applyFiltersAndSort();
    } catch (error) {
      console.error('集計開始年月の保存に失敗しました:', error);
      alert('集計開始年月の保存に失敗しました。');
    } finally {
      this.isUpdatingSystemStart = false;
      this.cdr.detectChanges();
    }
  }
}

