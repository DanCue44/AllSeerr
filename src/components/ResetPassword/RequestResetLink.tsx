import {
  AuthBackdrop,
  authCard,
  authInput,
  authPage,
  authPrimary,
} from '@app/components/Allseerr/Auth';
import AppLogo from '@app/components/Common/AppLogo';
import Button from '@app/components/Common/Button';
import ImageFader from '@app/components/Common/ImageFader';
import PageTitle from '@app/components/Common/PageTitle';
import LanguagePicker from '@app/components/Layout/LanguagePicker';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import defineMessages from '@app/utils/defineMessages';
import { ArrowLeftIcon, EnvelopeIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import Link from 'next/link';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import validator from 'validator';
import * as Yup from 'yup';

const messages = defineMessages('components.ResetPassword', {
  passwordreset: 'Password Reset',
  resetpassword: 'Reset your password',
  emailresetlink: 'Email Recovery Link',
  email: 'Email Address',
  validationemailrequired: 'You must provide a valid email address',
  gobacklogin: 'Return to Sign-In Page',
  requestresetlinksuccessmessage:
    'A password reset link will be sent to the provided email address if it is associated with a valid user.',
});

const rotateImages = [
  '/images/rotate1.jpg',
  '/images/rotate2.jpg',
  '/images/rotate3.jpg',
  '/images/rotate4.jpg',
  '/images/rotate5.jpg',
  '/images/rotate6.jpg',
];

const ResetPassword = () => {
  const intl = useIntl();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const [hasSubmitted, setSubmitted] = useState(false);

  const ResetSchema = Yup.object().shape({
    email: Yup.string()
      .test(
        'email',
        intl.formatMessage(messages.validationemailrequired),
        (value) => !value || validator.isEmail(value, { require_tld: false })
      )
      .required(intl.formatMessage(messages.validationemailrequired)),
  });

  return (
    <div
      className={
        ambient
          ? authPage
          : 'relative flex min-h-screen flex-col bg-gray-900 py-14'
      }
    >
      <PageTitle title={intl.formatMessage(messages.passwordreset)} />
      {ambient ? (
        <AuthBackdrop images={rotateImages} />
      ) : (
        <ImageFader forceOptimize backgroundImages={rotateImages} />
      )}
      <div className="absolute right-4 top-4 z-50">
        <LanguagePicker />
      </div>
      <div className="relative z-40 mt-10 flex flex-col items-center px-4 sm:mx-auto sm:w-full sm:max-w-md">
        <div
          className={`relative w-full max-w-full ${ambient ? 'h-40' : 'h-48'}`}
        >
          <AppLogo variant="stacked" />
        </div>
        <h2
          className={
            ambient
              ? 'mt-10 text-center font-display text-[26px] font-medium leading-9 text-as-ink'
              : 'mt-12 text-center text-3xl font-extrabold leading-9 text-gray-100'
          }
        >
          {intl.formatMessage(messages.resetpassword)}
        </h2>
      </div>
      <div className="relative z-50 mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div
          className={ambient ? authCard : 'bg-gray-800/50 shadow sm:rounded-lg'}
          style={ambient ? undefined : { backdropFilter: 'blur(5px)' }}
        >
          <div className={ambient ? 'px-6 py-8 sm:px-10' : 'px-10 py-8'}>
            {hasSubmitted ? (
              <>
                <p
                  className={`text-md ${
                    ambient ? 'text-as-ink-muted' : 'text-gray-300'
                  }`}
                >
                  {intl.formatMessage(messages.requestresetlinksuccessmessage)}
                </p>
                <span className="mt-4 flex justify-center rounded-md shadow-sm">
                  <Link href="/login" passHref legacyBehavior>
                    <Button as="a" buttonType="ghost">
                      <ArrowLeftIcon />
                      <span>{intl.formatMessage(messages.gobacklogin)}</span>
                    </Button>
                  </Link>
                </span>
              </>
            ) : (
              <Formik
                initialValues={{
                  email: '',
                }}
                validationSchema={ResetSchema}
                onSubmit={async (values) => {
                  const response = await axios.post(
                    `/api/v1/auth/reset-password`,
                    {
                      email: values.email,
                    }
                  );

                  if (response.status === 200) {
                    setSubmitted(true);
                  }
                }}
              >
                {({ errors, touched, isSubmitting, isValid }) => {
                  return (
                    <Form>
                      <div>
                        <label
                          htmlFor="email"
                          className="my-1 block text-sm font-medium leading-5 text-gray-400 sm:mt-px"
                        >
                          {intl.formatMessage(messages.email)}
                        </label>
                        <div className="mb-2 mt-1 sm:col-span-2 sm:mt-0">
                          <div className="form-input-field">
                            <Field
                              id="email"
                              name="email"
                              type="text"
                              inputMode="email"
                              className={
                                ambient
                                  ? `form-input-area ${authInput}`
                                  : 'form-input-area block w-full min-w-0 flex-1 rounded-md border border-gray-500 bg-gray-700 text-white transition duration-150 ease-in-out sm:text-sm sm:leading-5'
                              }
                            />
                          </div>
                          {errors.email &&
                            touched.email &&
                            typeof errors.email === 'string' && (
                              <div className="error">{errors.email}</div>
                            )}
                        </div>
                      </div>
                      <div
                        className={`mt-4 border-t pt-5 ${
                          ambient ? 'border-as-line' : 'border-gray-700'
                        }`}
                      >
                        <div className="flex justify-end">
                          <span className="inline-flex rounded-md shadow-sm">
                            <Button
                              buttonType="primary"
                              className={ambient ? authPrimary : undefined}
                              type="submit"
                              disabled={isSubmitting || !isValid}
                            >
                              <EnvelopeIcon />
                              <span>
                                {intl.formatMessage(messages.emailresetlink)}
                              </span>
                            </Button>
                          </span>
                        </div>
                      </div>
                    </Form>
                  );
                }}
              </Formik>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
