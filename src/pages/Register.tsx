import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Minus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const schema = z.object({
  full_name: z.string().min(3, 'Full name must be at least 3 characters'),
  phone_primary: z.string().min(10, 'Phone number must be valid'),
  phone_secondary: z.string().optional(),
  email_primary: z.string().email('Invalid email address').optional().or(z.literal('')),
  email_secondary: z.string().email('Invalid email address').optional().or(z.literal('')),
  facebook_link: z.string().url('Invalid URL').optional().or(z.literal('')),
  governorate: z.enum(['Minya', 'Asyut', 'Sohag', 'Qena']),
  seat_class: z.enum(['A', 'B', 'C']),
  status: z.enum(['interested', 'registered']),
  payment_type: z.enum(['deposit', 'full']).optional(),
  payment_amount: z.number().min(0).optional(),
});

type FormData = z.infer<typeof schema>;

const SEAT_PRICES = {
  A: 2000,
  B: 1700,
  C: 1500,
};

const Register: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showSecondaryPhone, setShowSecondaryPhone] = useState(false);
  const [showSecondaryEmail, setShowSecondaryEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      governorate: 'Minya',
      seat_class: 'B',
      status: 'registered',
      payment_type: 'deposit',
      payment_amount: 0,
    },
  });

  const status = watch('status');
  const seatClass = watch('seat_class');
  const paymentType = watch('payment_type');

  // Auto-fill full payment amount
  React.useEffect(() => {
    if (status === 'registered' && paymentType === 'full') {
      setValue('payment_amount', SEAT_PRICES[seatClass]);
    }
  }, [status, seatClass, paymentType, setValue]);

  const onSubmit = async (data: FormData) => {
    if (!user) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const newAttendeeId = crypto.randomUUID();
      const newAttendee = {
          id: newAttendeeId,
          created_at: new Date().toISOString(),
          ...data,
          created_by: user.id,
          // Handle optional/nulls
          payment_type: data.status === 'registered' ? data.payment_type : 'deposit',
          payment_amount: data.status === 'registered' ? Number(data.payment_amount) : 0,
          phone_secondary: data.phone_secondary || null,
          email_primary: data.email_primary || null,
          email_secondary: data.email_secondary || null,
          facebook_link: data.facebook_link || null,
          
          // Calculated fields for display
          remaining_amount: (data.status === 'registered') 
            ? Math.max(0, SEAT_PRICES[data.seat_class] - (Number(data.payment_amount) || 0))
            : SEAT_PRICES[data.seat_class],
            
          attendance_status: false,
          qr_code: newAttendeeId, // Use ID as QR content
          barcode: newAttendeeId.substring(0, 8), // Simple barcode
      };

      await api.post('/attendees', newAttendee);

      alert('Attendee registered successfully!');
      navigate('/attendees');
    } catch (error) {
      console.error('Registration error:', error);
      setSubmitError((error as Error).message || 'Failed to register attendee');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Register New Attendee</h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500">
          <p>Fill in the details to register a new attendee for the event.</p>
        </div>
        
        {submitError && (
          <div className="mt-4 bg-red-50 text-red-600 p-3 rounded text-sm">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-6">
          {/* Personal Info */}
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                Full Name (Triple) *
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  {...register('full_name')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                />
                {errors.full_name && <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>}
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="phone_primary" className="block text-sm font-medium text-gray-700">
                Phone Number *
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  {...register('phone_primary')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                />
                {errors.phone_primary && <p className="mt-1 text-sm text-red-600">{errors.phone_primary.message}</p>}
              </div>
            </div>

            <div className="sm:col-span-3">
               {!showSecondaryPhone ? (
                 <button
                   type="button"
                   onClick={() => setShowSecondaryPhone(true)}
                   className="mt-6 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                 >
                   <Plus className="h-4 w-4 mr-2" />
                   Add Secondary Phone
                 </button>
               ) : (
                 <div>
                   <label htmlFor="phone_secondary" className="block text-sm font-medium text-gray-700 flex justify-between">
                     <span>Secondary Phone</span>
                     <button type="button" onClick={() => { setShowSecondaryPhone(false); setValue('phone_secondary', ''); }} className="text-red-500 hover:text-red-700">
                       <Minus className="h-4 w-4" />
                     </button>
                   </label>
                   <div className="mt-1">
                     <input
                       type="text"
                       {...register('phone_secondary')}
                       className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                     />
                     {errors.phone_secondary && <p className="mt-1 text-sm text-red-600">{errors.phone_secondary.message}</p>}
                   </div>
                 </div>
               )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="email_primary" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  {...register('email_primary')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                />
                {errors.email_primary && <p className="mt-1 text-sm text-red-600">{errors.email_primary.message}</p>}
              </div>
            </div>

            <div className="sm:col-span-3">
               {!showSecondaryEmail ? (
                 <button
                   type="button"
                   onClick={() => setShowSecondaryEmail(true)}
                   className="mt-6 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                 >
                   <Plus className="h-4 w-4 mr-2" />
                   Add Secondary Email
                 </button>
               ) : (
                 <div>
                   <label htmlFor="email_secondary" className="block text-sm font-medium text-gray-700 flex justify-between">
                     <span>Secondary Email</span>
                     <button type="button" onClick={() => { setShowSecondaryEmail(false); setValue('email_secondary', ''); }} className="text-red-500 hover:text-red-700">
                       <Minus className="h-4 w-4" />
                     </button>
                   </label>
                   <div className="mt-1">
                     <input
                       type="email"
                       {...register('email_secondary')}
                       className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                     />
                     {errors.email_secondary && <p className="mt-1 text-sm text-red-600">{errors.email_secondary.message}</p>}
                   </div>
                 </div>
               )}
            </div>

            <div className="sm:col-span-6">
              <label htmlFor="facebook_link" className="block text-sm font-medium text-gray-700">
                Facebook Profile Link
              </label>
              <div className="mt-1">
                <input
                  type="url"
                  {...register('facebook_link')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                  placeholder="https://facebook.com/..."
                />
                {errors.facebook_link && <p className="mt-1 text-sm text-red-600">{errors.facebook_link.message}</p>}
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="governorate" className="block text-sm font-medium text-gray-700">
                Governorate *
              </label>
              <div className="mt-1">
                <select
                  {...register('governorate')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                >
                  <option value="Minya">Minya</option>
                  <option value="Asyut">Asyut</option>
                  <option value="Sohag">Sohag</option>
                  <option value="Qena">Qena</option>
                </select>
                {errors.governorate && <p className="mt-1 text-sm text-red-600">{errors.governorate.message}</p>}
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="seat_class" className="block text-sm font-medium text-gray-700">
                Seat Class *
              </label>
              <div className="mt-1">
                <select
                  {...register('seat_class')}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                >
                  <option value="A">Class A (2000 EGP)</option>
                  <option value="B">Class B (1700 EGP)</option>
                  <option value="C">Class C (1500 EGP)</option>
                </select>
                {errors.seat_class && <p className="mt-1 text-sm text-red-600">{errors.seat_class.message}</p>}
              </div>
            </div>

            <div className="sm:col-span-6 border-t pt-6 mt-2">
              <h4 className="text-md font-medium text-gray-900 mb-4">Registration Status</h4>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                    Client Status *
                  </label>
                  <div className="mt-1">
                    <select
                      {...register('status')}
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                    >
                      <option value="registered">Registered (Payment Required)</option>
                      <option value="interested">Interested (No Payment Yet)</option>
                    </select>
                    {errors.status && <p className="mt-1 text-sm text-red-600">{errors.status.message}</p>}
                  </div>
                </div>

                {status === 'registered' && (
                  <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6 bg-gray-50 p-4 rounded-md">
                    <div className="sm:col-span-3">
                      <label htmlFor="payment_type" className="block text-sm font-medium text-gray-700">
                        Payment Type
                      </label>
                      <div className="mt-1">
                        <select
                          {...register('payment_type')}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                        >
                          <option value="deposit">Deposit</option>
                          <option value="full">Full Payment</option>
                        </select>
                      </div>
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="payment_amount" className="block text-sm font-medium text-gray-700">
                        Payment Amount (EGP)
                      </label>
                      <div className="mt-1">
                        <input
                          type="number"
                          {...register('payment_amount', { valueAsNumber: true })}
                          onWheel={(e) => e.currentTarget.blur()} // Prevent mouse wheel change
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                        />
                        {errors.payment_amount && <p className="mt-1 text-sm text-red-600">{errors.payment_amount.message}</p>}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Total for Class {seatClass}: {SEAT_PRICES[seatClass]} EGP
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-5">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Saving...
                  </>
                ) : (
                  'Register Attendee'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
