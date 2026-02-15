#!/usr/bin/env python3
"""
PDF Parser Script
Extracts text from PDF files using PyPDF2
Usage: python parse-pdf.py <pdf_file_path>
"""

import sys
import json

def parse_pdf(pdf_path):
    try:
        import PyPDF2

        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""

            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"

            # Return as JSON
            result = {
                "success": True,
                "text": text.strip(),
                "pages": len(pdf_reader.pages)
            }
            print(json.dumps(result))

    except ImportError:
        result = {
            "success": False,
            "error": "PyPDF2 not installed. Please install it with: pip3 install PyPDF2"
        }
        print(json.dumps(result))
        sys.exit(1)

    except Exception as e:
        result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(result))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        result = {
            "success": False,
            "error": "Usage: python parse-pdf.py <pdf_file_path>"
        }
        print(json.dumps(result))
        sys.exit(1)

    pdf_path = sys.argv[1]
    parse_pdf(pdf_path)
