import React, { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabUnderlineProps {
  tabs: Tab[];
}

const TabUnderline: React.FC<TabUnderlineProps> = ({ tabs }) => {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || '');

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="rounded-xl border border-gray-200 p-6 dark:border-gray-800">
          <div className="border-b border-gray-200 dark:border-gray-800">
            <nav className="-mb-px flex space-x-2 overflow-x-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 dark:[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`inline-flex items-center border-b-2 px-2.5 py-2 text-sm font-medium transition-colors duration-200 ease-in-out ${
                    activeTab === tab.id
                      ? 'text-brand-500 dark:text-brand-400 border-brand-500 dark:border-brand-400'
                      : 'bg-transparent text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="pt-4 dark:border-gray-800">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={activeTab === tab.id ? 'block' : 'hidden'}
              >
                {/* <h3 className="mb-1 text-xl font-medium text-gray-800 dark:text-white/90">
                  {tab.label}
                </h3> */}
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {tab.content}
                </div>
              </div>
            ))}
          </div>
        </div>
    </div>
  );
};

export default TabUnderline;