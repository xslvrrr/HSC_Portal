import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Plus, Trash2, Edit2, Save, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSync } from './SyncContext';

export default function CustomCalendar() {
  const { data, updateRemote } = useSync();
  
  const [assessments, setAssessments] = useState(() => {
    const saved = localStorage.getItem('hsc_assessments');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Flag to avoid uploading assessments if they just came from remote sync
  const isSyncing = useRef(false);

  useEffect(() => {
    if (data && data.assessments) {
      isSyncing.current = true;
      setAssessments(data.assessments);
      localStorage.setItem('hsc_assessments', JSON.stringify(data.assessments));
    }
  }, [data?.assessments]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [formData, setFormData] = useState({
    day: '',
    period: '',
    weight: '',
    subject: '',
    topics: ''
  });

  useEffect(() => {
    localStorage.setItem('hsc_assessments', JSON.stringify(assessments));
    if (isSyncing.current) {
      isSyncing.current = false;
    } else {
      updateRemote('assessments', assessments);
    }
  }, [assessments, updateRemote]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (editingId) {
      setAssessments(prev => prev.map(assessment => 
        assessment.id === editingId 
          ? { ...assessment, ...formData }
          : assessment
      ));
      setEditingId(null);
    } else {
      const newAssessment = {
        id: Date.now(),
        ...formData
      };
      setAssessments(prev => [...prev, newAssessment]);
    }
    
    setFormData({ day: '', period: '', weight: '', subject: '', topics: '' });
    setShowForm(false);
  };

  const handleEdit = (assessment) => {
    setFormData({
      day: assessment.day,
      period: assessment.period,
      weight: assessment.weight,
      subject: assessment.subject,
      topics: assessment.topics
    });
    setEditingId(assessment.id);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this assessment?')) {
      setAssessments(prev => prev.filter(assessment => assessment.id !== id));
    }
  };

  const handleCancel = () => {
    setFormData({ day: '', period: '', weight: '', subject: '', topics: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const navigateMonth = (direction) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ day: null, isCurrentMonth: false });
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayAssessments = assessments.filter(a => a.day === dateStr);
      days.push({ day, isCurrentMonth: true, dateStr, assessments: dayAssessments });
    }
    
    return days;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const calendarDays = getDaysInMonth(currentMonth);

  return (
    <div className="content-band" style={{ padding: '0' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h2 style={{ fontSize: '24px', color: 'var(--header-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar size={28} />
          Assessment Calendar
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={18} />
          Add Assessment
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} className="modal-backdrop">
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '8px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: '20px', color: 'var(--header-primary)', marginBottom: '20px' }}>
              {editingId ? 'Edit Assessment' : 'Add New Assessment'}
            </h3>
            
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: 'var(--header-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>
                  Day
                </label>
                <input
                  type="date"
                  value={formData.day}
                  onChange={(e) => setFormData(prev => ({ ...prev, day: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-normal)',
                    border: '1px solid var(--bg-modifier-accent)',
                    borderRadius: '4px',
                    padding: '10px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: 'var(--header-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>
                  Period
                </label>
                <input
                  type="text"
                  value={formData.period}
                  onChange={(e) => setFormData(prev => ({ ...prev, period: e.target.value }))}
                  placeholder="e.g., Term 3, Week 5"
                  required
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-normal)',
                    border: '1px solid var(--bg-modifier-accent)',
                    borderRadius: '4px',
                    padding: '10px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: 'var(--header-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>
                  Weight (%)
                </label>
                <input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                  placeholder="e.g., 20"
                  min="0"
                  max="100"
                  required
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-normal)',
                    border: '1px solid var(--bg-modifier-accent)',
                    borderRadius: '4px',
                    padding: '10px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: 'var(--header-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="e.g., Mathematics Advanced"
                  required
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-normal)',
                    border: '1px solid var(--bg-modifier-accent)',
                    borderRadius: '4px',
                    padding: '10px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', color: 'var(--header-secondary)', fontSize: '12px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>
                  Topics
                </label>
                <textarea
                  value={formData.topics}
                  onChange={(e) => setFormData(prev => ({ ...prev, topics: e.target.value }))}
                  placeholder="e.g., Calculus, Algebra, Trigonometry"
                  required
                  rows={3}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-normal)',
                    border: '1px solid var(--bg-modifier-accent)',
                    borderRadius: '4px',
                    padding: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="btn-secondary"
                >
                  <X size={16} style={{ marginRight: '8px' }} />
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  <Save size={16} style={{ marginRight: '8px' }} />
                  {editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calendar Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        padding: '16px',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '8px'
      }}>
        <button
          onClick={() => navigateMonth(-1)}
          className="btn-secondary"
          style={{ padding: '8px 12px' }}
        >
          <ChevronLeft size={20} />
        </button>
        <h3 style={{ fontSize: '18px', color: 'var(--header-primary)', margin: 0 }}>
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <button
          onClick={() => navigateMonth(1)}
          className="btn-secondary"
          style={{ padding: '8px 12px' }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Calendar Grid */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '24px'
      }}>
        {/* Day Headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
          marginBottom: '8px'
        }}>
          {dayNames.map(day => (
            <div key={day} style={{
              textAlign: 'center',
              color: 'var(--header-secondary)',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              padding: '8px'
            }}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px'
        }}>
          {calendarDays.map((calendarDay, index) => (
            <div
              key={index}
              style={{
                minHeight: '80px',
                backgroundColor: calendarDay.isCurrentMonth ? 'var(--bg-tertiary)' : 'transparent',
                borderRadius: '4px',
                padding: '8px',
                border: calendarDay.isCurrentMonth ? '1px solid var(--bg-modifier-accent)' : 'none',
                cursor: calendarDay.isCurrentMonth ? 'pointer' : 'default',
                transition: 'background-color 0.15s ease-out'
              }}
              onClick={() => calendarDay.isCurrentMonth && setShowForm(true)}
              onMouseEnter={(e) => {
                if (calendarDay.isCurrentMonth) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-modifier-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (calendarDay.isCurrentMonth) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                }
              }}
            >
              {calendarDay.day && (
                <>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-normal)',
                    marginBottom: '4px'
                  }}>
                    {calendarDay.day}
                  </div>
                  {calendarDay.assessments && calendarDay.assessments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {calendarDay.assessments.slice(0, 2).map((assessment, idx) => (
                        <div
                          key={idx}
                          style={{
                            fontSize: '11px',
                            color: 'var(--header-primary)',
                            backgroundColor: 'var(--brand-experiment)',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          title={assessment.subject}
                        >
                          {assessment.subject}
                        </div>
                      ))}
                      {calendarDay.assessments.length > 2 && (
                        <div style={{
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          textAlign: 'center'
                        }}>
                          +{calendarDay.assessments.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Assessment List */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '8px',
        padding: '16px'
      }}>
        <h3 style={{ fontSize: '18px', color: 'var(--header-primary)', marginBottom: '16px' }}>
          All Assessments ({assessments.length})
        </h3>
        
        {assessments.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-muted)'
          }}>
            <Calendar size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <p>No assessments added yet. Click "Add Assessment" to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {assessments
              .sort((a, b) => new Date(a.day) - new Date(b.day))
              .map((assessment) => (
                <div
                  key={assessment.id}
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: '6px',
                    padding: '16px',
                    border: '1px solid var(--bg-modifier-accent)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '16px'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <h4 style={{ fontSize: '16px', color: 'var(--header-primary)', margin: 0 }}>
                        {assessment.subject}
                      </h4>
                      <span style={{
                        backgroundColor: 'var(--brand-experiment)',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        {assessment.weight}%
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      <strong>Date:</strong> {new Date(assessment.day).toLocaleDateString('en-AU', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                      <span style={{ margin: '0 8px' }}>•</span>
                      <strong>Period:</strong> {assessment.period}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-normal)' }}>
                      <strong>Topics:</strong> {assessment.topics}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleEdit(assessment)}
                      className="btn-secondary"
                      style={{ padding: '8px' }}
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(assessment.id)}
                      className="btn-danger"
                      style={{ padding: '8px' }}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
