import React from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';

interface ConferenceWorkspaceFiltersProps {
  search: string;
  setSearch: (s: string) => void;
  gradeFilter: string;
  setGradeFilter: (g: string) => void;
  classFilter: string;
  setClassFilter: (c: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  mentorFilter: string;
  setMentorFilter: (m: string) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  availableGrades: Array<string | number>;
  availableClasses: string[];
  availableMentors: Array<{ id: string; name: string }>;
  onClear: () => void;
  resultsCount: number;
}

export const ConferenceWorkspaceFilters: React.FC<ConferenceWorkspaceFiltersProps> = ({
  search,
  setSearch,
  gradeFilter,
  setGradeFilter,
  classFilter,
  setClassFilter,
  statusFilter,
  setStatusFilter,
  mentorFilter,
  setMentorFilter,
  sortBy,
  setSortBy,
  availableGrades,
  availableClasses,
  availableMentors,
  onClear,
  resultsCount,
}) => {
  const hasActiveFilters =
    search !== '' ||
    gradeFilter !== 'all' ||
    classFilter !== 'all' ||
    statusFilter !== 'all' ||
    mentorFilter !== 'all' ||
    sortBy !== 'name_asc';

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4" id="conference-filters-container">
      {/* Search and Sort row */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            id="filter-search-input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student by name or NIS..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
          />
          {search && (
            <button
              id="clear-search-btn"
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort Select */}
        <div className="w-full lg:w-64 flex items-center gap-2">
          <label htmlFor="filter-sort-select" className="text-xs font-semibold text-gray-500 whitespace-nowrap uppercase tracking-wider">
            Sort By:
          </label>
          <select
            id="filter-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="name_asc">Student Name (A-Z)</option>
            <option value="name_desc">Student Name (Z-A)</option>
            <option value="class_asc">Class</option>
            <option value="updated_desc">Last Updated (Newest)</option>
            <option value="status_desc">Response Status</option>
            <option value="mentor_asc">Mentor Name</option>
          </select>
        </div>
      </div>

      {/* Filter Options Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-50">
        {/* Grade Filter */}
        <div>
          <label htmlFor="filter-grade-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Grade
          </label>
          <select
            id="filter-grade-select"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">Pilih Grade</option>
            {availableGrades.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        {/* Class Filter */}
        <div>
          <label htmlFor="filter-class-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Class
          </label>
          <select
            id="filter-class-select"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Classes</option>
            {availableClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label htmlFor="filter-status-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Response Status
          </label>
          <select
            id="filter-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="CONFERENCE_COMPLETED">Conference Completed</option>
          </select>
        </div>

        {/* Mentor Filter */}
        <div>
          <label htmlFor="filter-mentor-select" className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            Mentor
          </label>
          <select
            id="filter-mentor-select"
            value={mentorFilter}
            onChange={(e) => setMentorFilter(e.target.value)}
            className="block w-full py-2 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Mentors</option>
            <option value="unassigned">Unassigned</option>
            {availableMentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results and Clear Button */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-xs">
        <span id="filters-results-count" className="text-gray-500 font-medium">
          Showing <strong className="text-gray-800">{resultsCount}</strong> Junior High student{resultsCount !== 1 ? 's' : ''}
        </span>
        {hasActiveFilters && (
          <button
            id="clear-all-filters-btn"
            onClick={onClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-red-600 hover:bg-red-50 font-semibold transition"
          >
            <SlidersHorizontal className="h-3 w-3" />
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
};
