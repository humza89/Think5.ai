"use client";

import Link from "next/link";
import { Twitter, Linkedin, Github } from "lucide-react";

const Footer = () => {
  const footerLinks = {
    Platform: [
      { name: "Product", href: "/product" },
      { name: "Aria", href: "/product#aria" },
      { name: "Nexus", href: "/product#nexus" },
      { name: "Forge", href: "/product#forge" },
    ],
    Company: [
      { name: "About", href: "/about" },
      { name: "Careers", href: "/careers" },
      { name: "Blog", href: "/blog" },
      { name: "Research", href: "/research" },
    ],
    Resources: [
      { name: "Documentation", href: "/docs" },
      { name: "Case Studies", href: "/case-studies" },
      { name: "Contact", href: "/contact" },
      { name: "Support", href: "/contact" },
    ],
    Legal: [
      { name: "Privacy Policy", href: "/privacy" },
      { name: "Terms of Service", href: "/terms" },
      { name: "Security", href: "/security" },
      { name: "Compliance", href: "/compliance" },
    ],
  };

  return (
    <footer className="bg-black border-t border-white/10">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Logo & Description */}
          <div className="col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <span className="text-xl font-bold text-white">think5.</span>
            </div>
            <p className="text-white/50 text-sm mb-6 max-w-xs">
              The AI platform for human intelligence. Sourcing, vetting, and deploying elite experts to train frontier AI systems.
            </p>
            <div className="flex items-center space-x-4">
              <Link href="https://twitter.com/think5ai" className="text-white/40 hover:text-white/70 transition-colors">
                <Twitter className="w-5 h-5" />
              </Link>
              <Link href="https://linkedin.com/company/think5ai" className="text-white/40 hover:text-white/70 transition-colors">
                <Linkedin className="w-5 h-5" />
              </Link>
              <Link href="https://github.com/think5ai" className="text-white/40 hover:text-white/70 transition-colors">
                <Github className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="font-medium text-white mb-4">{category}</h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/50 hover:text-white transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/40">
            &copy; {new Date().getFullYear()} Think5.ai. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/status" className="text-sm text-white/40 hover:text-white/60 transition-colors flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              All Systems Operational
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
