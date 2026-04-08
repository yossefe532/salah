export type UserRole = 'owner' | 'data_entry' | 'organizer' | 'social_media' | 'sales' | 'company_admin' | 'company_employee';

export interface Company {
  id: string;
  name: string;
  code?: string;
  owner_user_id?: string | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  company_id?: string | null;
  commission_balance?: number;
  created_at: string;
  updated_at?: string;
  full_name?: string;
}

export type Governorate = 'Minya' | 'Asyut' | 'Sohag' | 'Qena';
export type SeatClass = 'A' | 'B' | 'C';
export type PaymentType = 'deposit' | 'full';
export type AttendeeStatus = 'interested' | 'registered';
export type SalesChannel = 'direct' | 'sales_team' | 'external_partner' | 'sponsor_referral';
export type OccupationType = 'student' | 'employee' | 'business_owner' | 'executive';
export type SeatStatus = 'available' | 'reserved' | 'booked' | 'vip';

export interface Attendee {
  id: string;
  full_name: string;
  full_name_en?: string;
  phone_primary: string;
  phone_secondary?: string;
  email_primary?: string;
  email_secondary?: string;
  facebook_link?: string;
  university?: string;
  faculty?: string;
  year?: string;
  occupation_type?: OccupationType;
  organization_name?: string;
  notes?: string;
  governorate: Governorate;
  seat_class: SeatClass;
  seat_number?: number;
  ticket_price_override?: number;
  base_ticket_price?: number;
  certificate_included?: boolean;
  preferred_neighbor_name?: string;
  preferred_neighbor_ids?: string[];
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
  company_id?: string | null;
  created_at: string;
  updated_at: string;
  is_deleted?: boolean;
  sales_channel?: SalesChannel;
  sales_source_name?: string;
  commission_amount?: number;
  commission_notes?: string;
  lead_status?: 'under_review' | 'sales_completed' | 'registered';
  social_media_user_id?: string;
  sales_user_id?: string;
  social_commission_amount?: number;
  sales_commission_amount?: number;
  commission_distributed?: boolean;
  sales_verified_full_name?: boolean;
  sales_verified_phone?: boolean;
  sales_verified_photo?: boolean;
  sales_verified_job?: boolean;
  profile_photo_url?: string;
  warnings?: string[];
  ticket_printed?: boolean;
  ticket_printed_at?: string | null;
  certificate_printed?: boolean;
  certificate_printed_at?: string | null;
  job_title?: string;
  sales_verified_at?: string;
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

export interface ExpenseCategory {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  category_id?: string;
  title: string;
  amount: number;
  expense_date: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  expense_categories?: ExpenseCategory | null;
}

export interface Sponsor {
  id: string;
  company_name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at: string;
}

export interface SponsorContract {
  id: string;
  sponsor_id: string;
  contract_title: string;
  contract_amount: number;
  paid_amount: number;
  signed_at: string;
  due_date?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  sponsors?: Sponsor | null;
}

export interface SponsorPayment {
  id: string;
  sponsor_contract_id: string;
  amount: number;
  paid_at: string;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface SeatTable {
  id: string;
  event_id: string;
  seat_class: SeatClass;
  row_number: number;
  side: 'left' | 'right';
  table_order: number;
  seats_count: number;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  max_seats?: number;
}

export interface LayoutElement {
  id: string;
  event_id: string;
  element_type: 'stage' | 'blocked' | 'allowed';
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  label?: string;
  governorate?: string;
}

export interface Seat {
  id: string;
  event_id: string;
  seat_class: SeatClass;
  row_number: number;
  side: 'left' | 'right';
  table_id?: string | null;
  seat_number: number;
  seat_code: string;
  status: SeatStatus;
  position_x?: number | null;
  position_y?: number | null;
  reserved_by?: string | null;
  reserved_until?: string | null;
  attendee_id?: string | null;
  wave_number?: number | null;
  relative_x?: number | null;
  relative_y?: number | null;
}
