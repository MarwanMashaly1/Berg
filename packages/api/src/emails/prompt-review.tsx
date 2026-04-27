import {
  Html, Head, Body, Container, Section, Text, Link, Button,
  Hr, Preview, Font, Row, Column,
} from '@react-email/components';
import * as React from 'react';

type PromptOption = { key: string; emoji: string; text: string; index: number };

type DraftPrompt = {
  id: string;
  question: string;
  category: string;
  type: string;
  options: PromptOption[];
  tags: string[];
  approveUrl: string;
  rejectUrl: string;
};

type Props = {
  drafts: DraftPrompt[];
  batchDate: string;   // e.g. "Mon 21 Apr 2026"
  approveAllUrl: string;
};

const TYPE_COLORS: Record<string, string> = {
  pick_your_camp: '#FF6B35',
  this_or_that:   '#2D6A4F',
  spectrum:       '#3A8FC4',
  have_you_ever:  '#7B5EA7',
};

const TYPE_LABELS: Record<string, string> = {
  pick_your_camp: 'Pick your camp',
  this_or_that:   'This or that',
  spectrum:       'Spectrum',
  have_you_ever:  'Have you ever',
};

export function PromptReviewEmail({ drafts, batchDate, approveAllUrl }: Props) {
  return (
    <Html>
      <Head />
      <Preview>
        {drafts.length} new Berg prompts ready to review — {batchDate}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={logo}>Berg</Text>
            <Text style={headerTitle}>Weekly prompt batch</Text>
            <Text style={headerSub}>
              {drafts.length} drafts generated on {batchDate}. Review and approve below.
            </Text>
            <Button href={approveAllUrl} style={approveAllBtn}>
              Approve all {drafts.length}
            </Button>
          </Section>

          <Hr style={divider} />

          {/* Prompts */}
          {drafts.map((prompt, i) => {
            const color = TYPE_COLORS[prompt.type] ?? '#888';
            return (
              <Section key={prompt.id} style={promptSection}>
                {/* Number + type */}
                <Row>
                  <Column style={{ width: 28 }}>
                    <Text style={{ ...promptNum, color }}>{i + 1}</Text>
                  </Column>
                  <Column>
                    <Text style={{ ...typeBadge, backgroundColor: color + '18', color }}>
                      {TYPE_LABELS[prompt.type] ?? prompt.type}
                    </Text>
                    <Text style={categoryText}>{prompt.category}</Text>
                  </Column>
                </Row>

                {/* Question */}
                <Text style={question}>{prompt.question}</Text>

                {/* Options */}
                <Section style={optionsBox}>
                  {prompt.options.map((opt) => (
                    <Text key={opt.key} style={optionRow}>
                      {opt.emoji}  {opt.text}
                    </Text>
                  ))}
                </Section>

                {/* Tags */}
                {prompt.tags.length > 0 && (
                  <Text style={tagsText}>🏷 {prompt.tags.join(', ')}</Text>
                )}

                {/* Actions */}
                <Row style={actionRow}>
                  <Column>
                    <Link href={prompt.approveUrl} style={approveLink}>✅ Approve</Link>
                  </Column>
                  <Column>
                    <Link href={prompt.rejectUrl} style={rejectLink}>❌ Reject</Link>
                  </Column>
                </Row>

                <Hr style={{ ...divider, marginTop: 20 }} />
              </Section>
            );
          })}

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Berg Admin · These prompts will NOT go live until you approve them.
            </Text>
            <Link href={approveAllUrl} style={approveAllLink}>Approve all {drafts.length} prompts</Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: '#F8F4EF',
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '24px 16px',
  maxWidth: 600,
};

const header: React.CSSProperties = {
  backgroundColor: '#1A1614',
  borderRadius: 18,
  padding: '28px 28px 24px',
  textAlign: 'center',
  marginBottom: 20,
};

const logo: React.CSSProperties = {
  fontFamily: 'Georgia, serif',
  fontSize: 20,
  color: '#FF6B35',
  fontStyle: 'italic',
  margin: '0 0 8px',
};

const headerTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: '700',
  color: '#fff',
  margin: '0 0 6px',
  letterSpacing: -0.4,
};

const headerSub: React.CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.5)',
  margin: '0 0 20px',
};

const approveAllBtn: React.CSSProperties = {
  backgroundColor: '#FF6B35',
  borderRadius: 12,
  color: '#fff',
  fontSize: 14,
  fontWeight: '600',
  padding: '12px 28px',
  textDecoration: 'none',
  display: 'inline-block',
};

const divider: React.CSSProperties = {
  borderColor: 'rgba(0,0,0,0.08)',
  margin: '8px 0',
};

const promptSection: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: 14,
  padding: '18px 20px',
  marginBottom: 12,
  border: '1px solid rgba(0,0,0,0.07)',
};

const promptNum: React.CSSProperties = {
  fontSize: 20,
  fontWeight: '800',
  margin: 0,
  lineHeight: '1.2',
};

const typeBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: '700',
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  padding: '2px 8px',
  borderRadius: 6,
  margin: '0 0 2px',
};

const categoryText: React.CSSProperties = {
  fontSize: 11,
  color: '#9A8A7A',
  margin: '2px 0 0',
  textTransform: 'capitalize',
};

const question: React.CSSProperties = {
  fontSize: 17,
  fontWeight: '600',
  color: '#1A1A1A',
  margin: '12px 0 10px',
  lineHeight: 1.45,
  letterSpacing: -0.2,
};

const optionsBox: React.CSSProperties = {
  backgroundColor: '#F8F4EF',
  borderRadius: 10,
  padding: '10px 14px',
  marginBottom: 8,
};

const optionRow: React.CSSProperties = {
  fontSize: 13,
  color: '#444',
  margin: '4px 0',
};

const tagsText: React.CSSProperties = {
  fontSize: 11,
  color: '#B0A090',
  margin: '4px 0 10px',
};

const actionRow: React.CSSProperties = {
  marginTop: 12,
};

const approveLink: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#2D6A4F',
  color: '#fff',
  fontWeight: '600',
  fontSize: 13,
  padding: '9px 20px',
  borderRadius: 10,
  textDecoration: 'none',
};

const rejectLink: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#fee8e8',
  color: '#C53030',
  fontWeight: '600',
  fontSize: 13,
  padding: '9px 20px',
  borderRadius: 10,
  textDecoration: 'none',
  marginLeft: 12,
};

const footer: React.CSSProperties = {
  textAlign: 'center',
  padding: '16px 0 8px',
};

const footerText: React.CSSProperties = {
  fontSize: 11,
  color: '#B0A090',
  margin: '0 0 8px',
};

const approveAllLink: React.CSSProperties = {
  fontSize: 12,
  color: '#FF6B35',
  fontWeight: '600',
};

export default PromptReviewEmail;
