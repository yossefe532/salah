export type UserRole = 'owner' | 'data_entry' | 'organizer';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at?: string;
  full_name?: string;
}

export type Governorate = 'Minya' | 'Asyut' | 'Sohag' | 'Qena';
export type SeatClass = 'A' | 'B' | 'C';
export type PaymentType = 'deposit' | 'full';
export type AttendeeStatus = 'interested' | 'registered';

export interface Attendee {
  id: string;
  full_name: string;
  phone_primary: string;
  phone_secondary?: string;
  email_primary?: string;
  email_secondary?: string;
  facebook_link?: string;
  governorate: Governorate;
  seat_class: SeatClass;
  payment_type: PaymentType;
  payment_amount: number;
  remaining_amount: number;
  status: AttendeeStatus;
  qr_code?: string;
  barcode?: string;
  attendance_status: boolean;
  checked_in_at?: string;
  checked_in_by?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_deleted?: boolean;
}

export interface AttendanceLog {
  id: string;
  attendee_id: string;
  recorded_by: string;
  action: string;
  recorded_at: string;
}

export interface PaymentHistory {
  id: string;
  attendee_id: string;
  amount: number;
  payment_type: PaymentType;
  paid_at: string;
  recorded_by: string;
}
