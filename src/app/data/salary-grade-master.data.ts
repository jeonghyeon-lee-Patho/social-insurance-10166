/**
 * 標準報酬月額（給与等級）マスターデータ
 * 厚生年金保険の標準報酬月額等級（1～51等級）
 * ※51等級は育児休業等終了時の仮想等級として使用
 */

export interface SalaryGradeMaster {
  grade: number;               // 等級番号（0～51）
  displayName: string;         // 表示名（例: "22(19)等級"）
  minimumSalary: number;       // 等級の下限額（円）
  maximumSalary?: number | null;  // 等級の上限額（円）※最高等級はnull
  baseAmount: number;          // 標準報酬月額（円）
}

export const SALARY_GRADE_MASTER: SalaryGradeMaster[] = [
  // 等級 0: 随時改訂時の仮想等級
  { grade: 0, displayName: '1(1)等級', minimumSalary: 0, maximumSalary: 53000, baseAmount: 58000 },
  // 等級 1～50: 標準的な等級（健康保険と厚生年金で異なる表示）
  { grade: 1, displayName: '1(1)等級', minimumSalary: 53000, maximumSalary: 63000, baseAmount: 58000 },
  { grade: 2, displayName: '2(1)等級', minimumSalary: 63000, maximumSalary: 73000, baseAmount: 68000 },
  { grade: 3, displayName: '3(1)等級', minimumSalary: 73000, maximumSalary: 83000, baseAmount: 78000 },
  { grade: 4, displayName: '4(1)等級', minimumSalary: 83000, maximumSalary: 93000, baseAmount: 88000 },
  { grade: 5, displayName: '5(2)等級', minimumSalary: 93000, maximumSalary: 101000, baseAmount: 98000 },
  { grade: 6, displayName: '6(3)等級', minimumSalary: 101000, maximumSalary: 107000, baseAmount: 104000 },
  { grade: 7, displayName: '7(4)等級', minimumSalary: 107000, maximumSalary: 114000, baseAmount: 110000 },
  { grade: 8, displayName: '8(5)等級', minimumSalary: 114000, maximumSalary: 122000, baseAmount: 118000 },
  { grade: 9, displayName: '9(6)等級', minimumSalary: 122000, maximumSalary: 130000, baseAmount: 126000 },
  { grade: 10, displayName: '10(7)等級', minimumSalary: 130000, maximumSalary: 138000, baseAmount: 134000 },
  { grade: 11, displayName: '11(8)等級', minimumSalary: 138000, maximumSalary: 146000, baseAmount: 142000 },
  { grade: 12, displayName: '12(9)等級', minimumSalary: 146000, maximumSalary: 155000, baseAmount: 150000 },
  { grade: 13, displayName: '13(10)等級', minimumSalary: 155000, maximumSalary: 165000, baseAmount: 160000 },
  { grade: 14, displayName: '14(11)等級', minimumSalary: 165000, maximumSalary: 175000, baseAmount: 170000 },
  { grade: 15, displayName: '15(12)等級', minimumSalary: 175000, maximumSalary: 185000, baseAmount: 180000 },
  { grade: 16, displayName: '16(13)等級', minimumSalary: 185000, maximumSalary: 195000, baseAmount: 190000 },
  { grade: 17, displayName: '17(14)等級', minimumSalary: 195000, maximumSalary: 210000, baseAmount: 200000 },
  { grade: 18, displayName: '18(15)等級', minimumSalary: 210000, maximumSalary: 230000, baseAmount: 220000 },
  { grade: 19, displayName: '19(16)等級', minimumSalary: 230000, maximumSalary: 250000, baseAmount: 240000 },
  { grade: 20, displayName: '20(17)等級', minimumSalary: 250000, maximumSalary: 270000, baseAmount: 260000 },
  { grade: 21, displayName: '21(18)等級', minimumSalary: 270000, maximumSalary: 290000, baseAmount: 280000 },
  { grade: 22, displayName: '22(19)等級', minimumSalary: 290000, maximumSalary: 310000, baseAmount: 300000 },
  { grade: 23, displayName: '23(20)等級', minimumSalary: 310000, maximumSalary: 330000, baseAmount: 320000 },
  { grade: 24, displayName: '24(21)等級', minimumSalary: 330000, maximumSalary: 350000, baseAmount: 340000 },
  { grade: 25, displayName: '25(22)等級', minimumSalary: 350000, maximumSalary: 370000, baseAmount: 360000 },
  { grade: 26, displayName: '26(23)等級', minimumSalary: 370000, maximumSalary: 395000, baseAmount: 380000 },
  { grade: 27, displayName: '27(24)等級', minimumSalary: 395000, maximumSalary: 425000, baseAmount: 410000 },
  { grade: 28, displayName: '28(25)等級', minimumSalary: 425000, maximumSalary: 455000, baseAmount: 440000 },
  { grade: 29, displayName: '29(26)等級', minimumSalary: 455000, maximumSalary: 485000, baseAmount: 470000 },
  { grade: 30, displayName: '30(27)等級', minimumSalary: 485000, maximumSalary: 515000, baseAmount: 500000 },
  { grade: 31, displayName: '31(28)等級', minimumSalary: 515000, maximumSalary: 545000, baseAmount: 530000 },
  { grade: 32, displayName: '32(29)等級', minimumSalary: 545000, maximumSalary: 575000, baseAmount: 560000 },
  { grade: 33, displayName: '33(30)等級', minimumSalary: 575000, maximumSalary: 605000, baseAmount: 590000 },
  { grade: 34, displayName: '34(31)等級', minimumSalary: 605000, maximumSalary: 635000, baseAmount: 620000 },
  { grade: 35, displayName: '35(32)等級', minimumSalary: 635000, maximumSalary: 665000, baseAmount: 650000 },
  { grade: 36, displayName: '36(32)等級', minimumSalary: 665000, maximumSalary: 695000, baseAmount: 680000 },
  { grade: 37, displayName: '37(32)等級', minimumSalary: 695000, maximumSalary: 730000, baseAmount: 710000 },
  { grade: 38, displayName: '38(32)等級', minimumSalary: 730000, maximumSalary: 770000, baseAmount: 750000 },
  { grade: 39, displayName: '39(32)等級', minimumSalary: 770000, maximumSalary: 810000, baseAmount: 790000 },
  { grade: 40, displayName: '40(32)等級', minimumSalary: 810000, maximumSalary: 855000, baseAmount: 830000 },
  { grade: 41, displayName: '41(32)等級', minimumSalary: 855000, maximumSalary: 905000, baseAmount: 880000 },
  { grade: 42, displayName: '42(32)等級', minimumSalary: 905000, maximumSalary: 955000, baseAmount: 930000 },
  { grade: 43, displayName: '43(32)等級', minimumSalary: 955000, maximumSalary: 1005000, baseAmount: 980000 },
  { grade: 44, displayName: '44(32)等級', minimumSalary: 1005000, maximumSalary: 1055000, baseAmount: 1030000 },
  { grade: 45, displayName: '45(32)等級', minimumSalary: 1055000, maximumSalary: 1115000, baseAmount: 1090000 },
  { grade: 46, displayName: '46(32)等級', minimumSalary: 1115000, maximumSalary: 1175000, baseAmount: 1150000 },
  { grade: 47, displayName: '47(32)等級', minimumSalary: 1175000, maximumSalary: 1235000, baseAmount: 1210000 },
  { grade: 48, displayName: '48(32)等級', minimumSalary: 1235000, maximumSalary: 1295000, baseAmount: 1270000 },
  { grade: 49, displayName: '49(32)等級', minimumSalary: 1295000, maximumSalary: 1355000, baseAmount: 1330000 },
  { grade: 50, displayName: '50(32)等級', minimumSalary: 1355000, maximumSalary: 1415000, baseAmount: 1390000 },  
  // 等級 51: 随時改訂時の仮想等級
  { grade: 51, displayName: '50(32)等級', minimumSalary: 1415000, maximumSalary: null, baseAmount: 1390000 }
];

/**
 * 報酬月額から対応する等級を取得
 */
export function determineSalaryGrade(monthlyAmount: number): SalaryGradeMaster {
  if (monthlyAmount <= 0) {
    return SALARY_GRADE_MASTER[0];
  }

  for (const grade of SALARY_GRADE_MASTER) {
    if (grade.maximumSalary === null || grade.maximumSalary === undefined) {
      if (monthlyAmount >= grade.minimumSalary) {
        return grade;
      }
      continue;
    }
    if (monthlyAmount >= grade.minimumSalary && monthlyAmount < grade.maximumSalary) {
      return grade;
    }
  }

  // フォールバック：最高等級を返す
  return SALARY_GRADE_MASTER[SALARY_GRADE_MASTER.length - 1]; 
}

/**
 * 等級番号から等級マスターを取得
 */
export function getSalaryGradeByNumber(gradeNumber: number): SalaryGradeMaster | null {
  return SALARY_GRADE_MASTER.find(g => g.grade === gradeNumber) || null;
}
