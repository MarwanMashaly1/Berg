import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Preview,
} from '@react-email/components';
import * as React from 'react';

type MagicLinkEmailProps = {
  url: string;
  email: string;
  shortCode?: string;
};

export function MagicLinkEmail({ url, email, shortCode }: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Berg sign-in link — expires in 15 minutes</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Logo / Brand */}
          <Section style={logoSection}>
            <Text style={logoText}>🧊 Berg</Text>
          </Section>

          {/* Main content */}
          <Section style={main}>
            <Text style={heading}>Sign in to Berg</Text>
            <Text style={paragraph}>
              You requested a sign-in link for <strong>{email}</strong>.
              Tap the button below to sign in — this link expires in{' '}
              <strong>15 minutes</strong>.
            </Text>

            <Section style={buttonContainer}>
              <Button style={buttonStyle} href={url}>
                Open Berg
              </Button>
            </Section>

            {shortCode && (
              <>
                <Hr style={{ borderColor: '#E8E4E0', margin: '20px 0 16px' }} />
                <Text style={paragraphSmall}>
                  Or enter this code in the app:
                </Text>
                <Text style={codeStyle}>{shortCode}</Text>
              </>
            )}

            <Text style={paragraphSmall}>
              If the button doesn&apos;t work, copy and paste this link into
              Safari:
            </Text>
            <Text style={link}>{url}</Text>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              If you didn&apos;t request this sign-in link, you can safely
              ignore this email. Your account is secure.
            </Text>
            <Text style={footerText}>
              © {new Date().getFullYear()} Berg. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const body: React.CSSProperties = {
  backgroundColor: '#FAFAFA',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: '0',
  padding: '0',
};

const container: React.CSSProperties = {
  margin: '0 auto',
  maxWidth: '480px',
  padding: '20px 0 48px',
};

const logoSection: React.CSSProperties = {
  padding: '24px 24px 0',
};

const logoText: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#1A1A1A',
  margin: '0',
};

const main: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '16px',
  border: '1px solid #E8E4E0',
  padding: '32px 24px',
  margin: '16px 0',
};

const heading: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#1A1A1A',
  margin: '0 0 16px',
  lineHeight: '1.3',
};

const paragraph: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#444444',
  margin: '0 0 24px',
};

const paragraphSmall: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '1.5',
  color: '#999999',
  margin: '16px 0 4px',
};

const buttonContainer: React.CSSProperties = {
  textAlign: 'center',
  margin: '8px 0',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#FF6B35',
  borderRadius: '12px',
  color: '#FFFFFF',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center',
  display: 'inline-block',
  padding: '14px 32px',
};

const codeStyle: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: '700',
  color: '#1A1A1A',
  letterSpacing: '8px',
  textAlign: 'center',
  margin: '8px 0 0',
  fontFamily: 'monospace',
};

const link: React.CSSProperties = {
  fontSize: '12px',
  color: '#FF6B35',
  wordBreak: 'break-all',
  margin: '0',
};

const hr: React.CSSProperties = {
  borderColor: '#E8E4E0',
  margin: '16px 0',
};

const footer: React.CSSProperties = {
  padding: '0 24px',
};

const footerText: React.CSSProperties = {
  fontSize: '12px',
  color: '#999999',
  lineHeight: '1.5',
  margin: '0 0 8px',
};
