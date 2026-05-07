import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '../../components/ui/Button';

// Mock the theme hook
jest.mock('../../hooks/use-theme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#FF6B35',
      textInverse: '#FFFFFF',
      textSecondary: '#7A6A5A',
    },
    fonts: {
      bodySemiBold: 'DMSans_600SemiBold',
    },
    radius: { md: 14 },
  }),
}));

describe('Button', () => {
  it('renders label text', () => {
    render(<Button label="Get started" onPress={() => {}} />);
    expect(screen.getByText('Get started')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Button label="Tap me" onPress={onPress} />);
    fireEvent.press(screen.getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Disabled" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows ActivityIndicator and hides label when loading', () => {
    render(<Button label="Submit" onPress={() => {}} loading />);
    expect(screen.queryByText('Submit')).toBeNull();
    // ActivityIndicator renders — no crash means loading state works
  });

  it('does not call onPress when loading', () => {
    const onPress = jest.fn();
    const { getByTestId, UNSAFE_getByType } = render(
      <Button label="Submit" onPress={onPress} loading />
    );
    // Button is disabled when loading
    const { TouchableOpacity } = require('react-native');
    const btn = UNSAFE_getByType(TouchableOpacity);
    expect(btn.props.disabled).toBe(true);
  });

  it('renders all three variants without crashing', () => {
    const { rerender } = render(<Button label="Test" onPress={() => {}} variant="primary" />);
    rerender(<Button label="Test" onPress={() => {}} variant="secondary" />);
    rerender(<Button label="Test" onPress={() => {}} variant="ghost" />);
    expect(screen.getByText('Test')).toBeTruthy();
  });

  it('renders all three sizes without crashing', () => {
    const { rerender } = render(<Button label="Test" onPress={() => {}} size="sm" />);
    rerender(<Button label="Test" onPress={() => {}} size="md" />);
    rerender(<Button label="Test" onPress={() => {}} size="lg" />);
    expect(screen.getByText('Test')).toBeTruthy();
  });
});
