import { getHomePath } from './permissions';

export function needsEmployeeOnboarding(user) {
  if (user?.role !== 'employee') {
    return false;
  }

  if (typeof user.needs_onboarding === 'boolean') {
    return user.needs_onboarding;
  }

  return !user.rules_accepted_at || Boolean(user.must_change_password);
}

export function getPostLoginPath(user) {
  if (needsEmployeeOnboarding(user)) {
    return '/employee/onboarding';
  }

  return getHomePath(user.role);
}

export function getOnboardingStep(user) {
  if (!user?.rules_accepted_at) {
    return 'rules';
  }

  if (user.must_change_password) {
    return 'password';
  }

  return 'done';
}

export const EMPLOYEE_ONBOARDING_PATH = '/employee/onboarding';

export const EMPLOYEE_ONBOARDING_ALLOWED_PATHS = [
  EMPLOYEE_ONBOARDING_PATH,
];
