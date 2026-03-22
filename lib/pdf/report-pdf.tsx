import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10 },
  header: { marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "#6b7280", marginBottom: 2 },
  meta: { fontSize: 9, color: "#9ca3af", marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "bold", marginBottom: 8, color: "#111827", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 4 },
  headline: { fontSize: 11, fontStyle: "italic", color: "#374151", marginBottom: 12, padding: 8, backgroundColor: "#f9fafb", borderLeftWidth: 3, borderLeftColor: "#6366f1" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  scoreLabel: { fontSize: 10, color: "#374151" },
  scoreValue: { fontSize: 10, fontWeight: "bold" },
  badge: { fontSize: 9, padding: "2 6", borderRadius: 4, color: "#ffffff" },
  summaryText: { fontSize: 10, color: "#374151", lineHeight: 1.5, marginBottom: 8 },
  skillRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#f3f4f6" },
  skillName: { fontSize: 10, color: "#374151", flex: 1 },
  skillRating: { fontSize: 10, fontWeight: "bold", width: 30, textAlign: "right" },
  listItem: { fontSize: 10, color: "#374151", marginBottom: 3, paddingLeft: 8 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#9ca3af" },
});

interface ReportPDFProps {
  candidateName: string;
  candidateTitle?: string | null;
  interviewType: string;
  interviewDate: string;
  report: {
    overallScore?: number | null;
    headline?: string | null;
    confidenceLevel?: string | null;
    recommendation?: string | null;
    summary?: string | null;
    technicalSkills?: Array<{ skill: string; rating: number; description?: string }> | null;
    softSkills?: Array<{ skill: string; rating: number }> | null;
    domainExpertise?: number | null;
    clarityStructure?: number | null;
    problemSolving?: number | null;
    communicationScore?: number | null;
    measurableImpact?: number | null;
    professionalExperience?: number | null;
    roleFit?: number | null;
    culturalFit?: number | null;
    thinkingJudgment?: number | null;
    strengths?: string[] | null;
    areasToImprove?: string[] | null;
    hiringAdvice?: string | null;
    jobMatchScore?: number | null;
  };
}

function ScoreRow({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <Text style={styles.scoreValue}>{value}/100</Text>
    </View>
  );
}

function getRecommendationColor(rec: string): string {
  switch (rec) {
    case "STRONG_YES": return "#16a34a";
    case "YES": return "#22c55e";
    case "MAYBE": return "#f59e0b";
    case "NO": return "#ef4444";
    case "STRONG_NO": return "#dc2626";
    default: return "#6b7280";
  }
}

export function ReportPDF({ candidateName, candidateTitle, interviewType, interviewDate, report }: ReportPDFProps) {
  const date = new Date(interviewDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{candidateName}</Text>
          {candidateTitle && <Text style={styles.subtitle}>{candidateTitle}</Text>}
          <Text style={styles.meta}>
            {interviewType.replace("_", " ")} Interview — {date}
          </Text>
        </View>

        {/* Headline */}
        {report.headline && (
          <View style={styles.headline}>
            <Text>{report.headline}</Text>
          </View>
        )}

        {/* Overall Score & Recommendation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assessment Summary</Text>
          <View style={styles.row}>
            <Text style={styles.scoreLabel}>Overall Score</Text>
            <Text style={{ ...styles.scoreValue, fontSize: 14 }}>
              {report.overallScore ?? "N/A"}/100
            </Text>
          </View>
          {report.recommendation && (
            <View style={styles.row}>
              <Text style={styles.scoreLabel}>Recommendation</Text>
              <Text style={{ ...styles.scoreValue, color: getRecommendationColor(report.recommendation) }}>
                {report.recommendation.replace("_", " ")}
              </Text>
            </View>
          )}
          {report.confidenceLevel && (
            <View style={styles.row}>
              <Text style={styles.scoreLabel}>Confidence</Text>
              <Text style={styles.scoreValue}>{report.confidenceLevel}</Text>
            </View>
          )}
          {report.jobMatchScore != null && (
            <View style={styles.row}>
              <Text style={styles.scoreLabel}>Job Match</Text>
              <Text style={styles.scoreValue}>{report.jobMatchScore}/100</Text>
            </View>
          )}
        </View>

        {/* Summary */}
        {report.summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <Text style={styles.summaryText}>{report.summary}</Text>
          </View>
        )}

        {/* Dimension Scores */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dimension Scores</Text>
          <ScoreRow label="Domain Expertise" value={report.domainExpertise} />
          <ScoreRow label="Clarity & Structure" value={report.clarityStructure} />
          <ScoreRow label="Problem Solving" value={report.problemSolving} />
          <ScoreRow label="Communication" value={report.communicationScore} />
          <ScoreRow label="Measurable Impact" value={report.measurableImpact} />
          <ScoreRow label="Professional Experience" value={report.professionalExperience} />
          <ScoreRow label="Role Fit" value={report.roleFit} />
          <ScoreRow label="Cultural Fit" value={report.culturalFit} />
          <ScoreRow label="Thinking & Judgment" value={report.thinkingJudgment} />
        </View>

        {/* Technical Skills */}
        {report.technicalSkills && report.technicalSkills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Technical Skills</Text>
            {report.technicalSkills.map((skill, i) => (
              <View key={i} style={styles.skillRow}>
                <Text style={styles.skillName}>{skill.skill}</Text>
                <Text style={styles.skillRating}>{skill.rating}/10</Text>
              </View>
            ))}
          </View>
        )}

        {/* Strengths */}
        {report.strengths && report.strengths.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Strengths</Text>
            {report.strengths.map((s, i) => (
              <Text key={i} style={styles.listItem}>• {s}</Text>
            ))}
          </View>
        )}

        {/* Areas to Improve */}
        {report.areasToImprove && report.areasToImprove.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Areas to Improve</Text>
            {report.areasToImprove.map((a, i) => (
              <Text key={i} style={styles.listItem}>• {a}</Text>
            ))}
          </View>
        )}

        {/* Hiring Advice */}
        {report.hiringAdvice && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hiring Advice</Text>
            <Text style={styles.summaryText}>{report.hiringAdvice}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          Generated by Think5 AI Interview Platform — Confidential
        </Text>
      </Page>
    </Document>
  );
}
