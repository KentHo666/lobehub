'use client';

import { MAX_ONBOARDING_STEPS } from '@lobechat/types';
import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import Loading from '@/components/Loading/BrandTextLoading';
import ModeSwitch from '@/features/Onboarding/components/ModeSwitch';
import OnboardingContainer from '@/routes/onboarding/_layout';
import FullNameStep from '@/routes/onboarding/features/FullNameStep';
import InterestsStep from '@/routes/onboarding/features/InterestsStep';
import ProSettingsStep from '@/routes/onboarding/features/ProSettingsStep';
import ResponseLanguageStep from '@/routes/onboarding/features/ResponseLanguageStep';
import TelemetryStep from '@/routes/onboarding/features/TelemetryStep';
import { useUserStore } from '@/store/user';
import { onboardingSelectors } from '@/store/user/selectors';

const ClassicOnboardingPage = memo(() => {
  const [isUserStateInit, currentStep, goToNextStep, goToPreviousStep] = useUserStore((s) => [
    s.isUserStateInit,
    onboardingSelectors.currentStep(s),
    s.goToNextStep,
    s.goToPreviousStep,
  ]);

  if (!isUserStateInit) {
    return <Loading debugId="ClassicOnboarding" />;
  }

  const stepMap = {
    1: {
      Component: TelemetryStep,
      name: 'TelemetryStep',
      props: { onNext: goToNextStep },
    },
    2: {
      Component: FullNameStep,
      name: 'FullNameStep',
      props: { onBack: goToPreviousStep, onNext: goToNextStep },
    },
    3: {
      Component: InterestsStep,
      name: 'InterestsStep',
      props: { onBack: goToPreviousStep, onNext: goToNextStep },
    },
    4: {
      Component: ResponseLanguageStep,
      name: 'ResponseLanguageStep',
      props: { onBack: goToPreviousStep, onNext: goToNextStep },
    },
    [MAX_ONBOARDING_STEPS]: {
      Component: ProSettingsStep,
      name: 'ProSettingsStep',
      props: { onBack: goToPreviousStep },
    },
  } as const;

  const renderStep = () => {
    switch (currentStep) {
      case 1: {
        return <TelemetryStep {...stepMap[1].props} />;
      }
      case 2: {
        return <FullNameStep {...stepMap[2].props} />;
      }
      case 3: {
        return <InterestsStep {...stepMap[3].props} />;
      }
      case 4: {
        return <ResponseLanguageStep {...stepMap[4].props} />;
      }
      case MAX_ONBOARDING_STEPS: {
        return <ProSettingsStep {...stepMap[MAX_ONBOARDING_STEPS].props} />;
      }
      default: {
        return null;
      }
    }
  };

  return (
    <OnboardingContainer>
      <Flexbox gap={24} style={{ maxWidth: 600, width: '100%' }}>
        <ModeSwitch />
        {renderStep()}
      </Flexbox>
    </OnboardingContainer>
  );
});

ClassicOnboardingPage.displayName = 'ClassicOnboardingPage';

export default ClassicOnboardingPage;
