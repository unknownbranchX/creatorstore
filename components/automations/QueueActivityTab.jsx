'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/clientApi'
import { Button } from '@/components/ui/button'
import {
  Clock, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  PauseCircle, PlayCircle, ShieldCheck, ArrowRight, MessageSquare, AlertCircle
} from 'lucide-react'

export default function QueueActivityTab() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [jobs, setJobs] = useState([])
  const [stats, setStats] = useState({
    pending: 0,
    processing: 0,
    retrying: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
    oldestPendingAgeSec: 0,
  })
  const [rateLimitStatus, setRateLimitStatus] = useState(null)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [pausingAccount, setPausingAccount] = useState(false)

  const fetchQueueData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      const url = statusFilter && statusFilter !== 'ALL'
        ? `/automations/queue?status=${statusFilter}&limit=50`
        : '/automations/queue?limit=50'

      const res = await api.get(url)
      setJobs(res.items || [])
      setStats(res.stats || {
        pending: 0,
        processing: 0,
        retrying: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
        oldestPendingAgeSec: 0,
      })
      setRateLimitStatus(res.rateLimitStatus || null)
    } catch (err) {
      console.error('Failed to load queue status:', err)
      if (!isSilent) toast.error('Failed to load queue activity.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchQueueData()
    // Poll every 10 seconds while tab is active
    const interval = setInterval(() => {
      fetchQueueData(true)
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchQueueData])

  async function handleRetry(jobId) {
    setActionLoadingId(jobId)
    try {
      const res = await api.post(`/automations/queue/${jobId}/retry`, {})
      if (res.success) {
        toast.success('Job rescheduled for sending.')
        fetchQueueData(true)
      } else {
        toast.error(res.reason || 'Could not retry job.')
      }
    } catch (err) {
      toast.error(err.message || 'Retry failed.')
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleCancel(jobId) {
    setActionLoadingId(jobId)
    try {
      const res = await api.post(`/automations/queue/${jobId}/cancel`, {})
      if (res.success) {
        toast.success('Queued job cancelled.')
        fetchQueueData(true)
      } else {
        toast.error(res.reason || 'Could not cancel job.')
      }
    } catch (err) {
      toast.error(err.message || 'Cancel failed.')
    } finally {
      setActionLoadingId(null)
    }
  }

  async function handleToggleAccountPause() {
    setPausingAccount(true)
    try {
      const isCurrentlyPaused = rateLimitStatus?.isPaused
      if (isCurrentlyPaused) {
        const res = await api.post('/automations/queue/account/resume', {})
        if (res.success) {
          toast.success('Instagram Auto-DM queue resumed.')
          fetchQueueData(true)
        } else {
          toast.error(res.error || 'Failed to resume queue.')
        }
      } else {
        const res = await api.post('/automations/queue/account/pause', { pauseMinutes: 30 })
        if (res.success) {
          toast.success('Instagram Auto-DM queue paused for 30 minutes.')
          fetchQueueData(true)
        } else {
          toast.error(res.error || 'Failed to pause queue.')
        }
      }
    } catch (err) {
      toast.error(err.message || 'Action failed.')
    } finally {
      setPausingAccount(false)
    }
  }

  function formatTime(isoString) {
    if (!isoString) return '—'
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" /> Waiting
          </span>
        )
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" /> In-Flight
          </span>
        )
      case 'RETRYING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
            <AlertTriangle className="h-3 w-3" /> Retrying
          </span>
        )
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> Delivered
          </span>
        )
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="h-3 w-3" /> Failed
          </span>
        )
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
            Cancelled
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Account Rate Limit / Health Banner */}
      <div className={`p-4 rounded-[20px] border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
        rateLimitStatus?.isPaused
          ? 'bg-amber-50/70 border-amber-200 text-amber-900'
          : 'bg-[#FFFFFF] border-[#E5E5E3] text-[#1F1F1F]'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
            rateLimitStatus?.isPaused ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'
          }`}>
            {rateLimitStatus?.isPaused ? (
              <PauseCircle className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="text-sm font-bold flex items-center gap-2">
              {rateLimitStatus?.isPaused ? 'Auto-DM Queue Paused' : 'Rate Limiter & Policy Protection Active'}
              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                rateLimitStatus?.isPaused ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {rateLimitStatus?.isPaused ? 'PAUSED' : 'HEALTHY'}
              </span>
            </div>
            <p className="text-xs text-[#6F6F6B] mt-0.5">
              {rateLimitStatus?.isPaused
                ? `Queue paused: ${rateLimitStatus.pauseReason || 'Throttled by Meta'}. Resumes automatically or manually.`
                : 'Pacing sends with 3-second spacing (max 20/min, 200/hr) respecting Meta Graph API limits.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchQueueData}
            disabled={refreshing}
            className="h-8 text-xs font-bold rounded-full border-[#E5E5E3] hover:bg-[#F5F5F3]"
          >
            <RefreshCw className={`h-3 w-3 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={handleToggleAccountPause}
            disabled={pausingAccount}
            className={`h-8 text-xs font-bold rounded-full ${
              rateLimitStatus?.isPaused
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-[#1F1F1F] hover:bg-black text-white'
            }`}
          >
            {pausingAccount ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : rateLimitStatus?.isPaused ? (
              <PlayCircle className="h-3.5 w-3.5 mr-1" />
            ) : (
              <PauseCircle className="h-3.5 w-3.5 mr-1" />
            )}
            {rateLimitStatus?.isPaused ? 'Resume Sending' : 'Pause Queue'}
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-[#6F6F6B] uppercase tracking-wider">Waiting</div>
          <div className="text-2xl font-black text-[#1F1F1F]">{stats.pending}</div>
          <div className="text-[10px] text-[#6F6F6B]">Awaiting worker slot</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-[#6F6F6B] uppercase tracking-wider">Sending</div>
          <div className="text-2xl font-black text-blue-600">{stats.processing}</div>
          <div className="text-[10px] text-[#6F6F6B]">Active in worker</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-[#6F6F6B] uppercase tracking-wider">Retrying</div>
          <div className="text-2xl font-black text-orange-600">{stats.retrying}</div>
          <div className="text-[10px] text-[#6F6F6B]">Backing off with jitter</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-[#6F6F6B] uppercase tracking-wider">Delivered</div>
          <div className="text-2xl font-black text-emerald-600">{stats.sent}</div>
          <div className="text-[10px] text-[#6F6F6B]">Accepted by Meta</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-[#6F6F6B] uppercase tracking-wider">Failed</div>
          <div className="text-2xl font-black text-rose-600">{stats.failed}</div>
          <div className="text-[10px] text-[#6F6F6B]">Policy or permanent</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E5E3] rounded-[18px] p-3.5 space-y-1">
          <div className="text-[11px] font-bold text-[#6F6F6B] uppercase tracking-wider">Oldest Wait</div>
          <div className="text-2xl font-black text-[#1F1F1F]">
            {stats.oldestPendingAgeSec > 60
              ? `${Math.floor(stats.oldestPendingAgeSec / 60)}m`
              : `${stats.oldestPendingAgeSec}s`}
          </div>
          <div className="text-[10px] text-[#6F6F6B]">Pending queue latency</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['ALL', 'PENDING', 'PROCESSING', 'RETRYING', 'SENT', 'FAILED', 'CANCELLED'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              statusFilter === st
                ? 'bg-[#1F1F1F] text-white'
                : 'bg-white text-[#6F6F6B] hover:text-[#1F1F1F] border border-[#E5E5E3]'
            }`}
          >
            {st === 'ALL' ? 'All Jobs' : st.charAt(0) + st.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Jobs List / Table */}
      {loading ? (
        <div className="flex h-64 items-center justify-center bg-[#FFFFFF] rounded-[24px] border border-[#E5E5E3]">
          <Loader2 className="h-8 w-8 animate-spin text-[#1F1F1F]" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-[#FFFFFF] rounded-[24px] border border-[#E5E5E3] p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-[#F2F1EF] flex items-center justify-center text-[#6F6F6B]">
            <Clock className="h-6 w-6" />
          </div>
          <h4 className="text-base font-bold text-[#1F1F1F]">No queue jobs found</h4>
          <p className="text-xs text-[#6F6F6B] max-w-sm mx-auto">
            When users comment on your Instagram posts, eligible Auto-DMs are safely enqueued and paced here.
          </p>
        </div>
      ) : (
        <div className="bg-[#FFFFFF] rounded-[24px] border border-[#E5E5E3] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9F9F8] border-b border-[#E5E5E3] text-[#6F6F6B] font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Automation</th>
                  <th className="px-5 py-3.5">Recipient</th>
                  <th className="px-5 py-3.5">Attempts</th>
                  <th className="px-5 py-3.5">Timing</th>
                  <th className="px-5 py-3.5">Failure / Note</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E3]">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-[#FDFDFD] transition-colors">
                    {/* Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {getStatusBadge(job.status)}
                    </td>

                    {/* Automation */}
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#1F1F1F] line-clamp-1">{job.automationName}</div>
                      <div className="text-[11px] text-[#6F6F6B] line-clamp-1 mt-0.5">
                        {job.message?.slice(0, 50)}...
                      </div>
                    </td>

                    {/* Recipient */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="font-medium text-[#1F1F1F]">@{job.recipientUsername}</div>
                      <div className="text-[10px] text-[#6F6F6B] font-mono">
                        {job.commentId ? `c_${job.commentId.slice(0, 10)}...` : '—'}
                      </div>
                    </td>

                    {/* Attempts */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="font-bold text-[#1F1F1F]">{job.attemptCount}</span>
                      <span className="text-[#6F6F6B]"> / {job.maxAttempts}</span>
                    </td>

                    {/* Timing */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="text-[11px] text-[#1F1F1F]">
                        {job.sentAt ? `Sent: ${formatTime(job.sentAt)}` : `Sched: ${formatTime(job.scheduledAt)}`}
                      </div>
                      {job.status === 'RETRYING' && job.nextAttemptAt && (
                        <div className="text-[10px] text-orange-600 font-medium">
                          Next: {formatTime(job.nextAttemptAt)}
                        </div>
                      )}
                    </td>

                    {/* Failure Reason */}
                    <td className="px-5 py-4 max-w-xs">
                      {job.lastErrorMessage ? (
                        <div className="text-[11px] text-rose-600 line-clamp-2" title={job.lastErrorMessage}>
                          <span className="font-bold text-[10px] uppercase bg-rose-50 px-1 py-0.5 rounded mr-1">
                            {job.lastErrorCategory || 'ERROR'}
                          </span>
                          {job.lastErrorMessage}
                        </div>
                      ) : (
                        <span className="text-[#6F6F6B] text-[11px]">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(job.id)}
                          disabled={actionLoadingId === job.id}
                          className="h-7 px-3 text-[11px] font-bold rounded-full border-[#E5E5E3] hover:bg-[#F2F1EF]"
                        >
                          {actionLoadingId === job.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Retry'
                          )}
                        </Button>
                      )}

                      {(job.status === 'PENDING' || job.status === 'RETRYING') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCancel(job.id)}
                          disabled={actionLoadingId === job.id}
                          className="h-7 px-2.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-full"
                        >
                          {actionLoadingId === job.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Cancel'
                          )}
                        </Button>
                      )}

                      {job.status === 'SENT' && (
                        <span className="text-[11px] text-emerald-600 font-bold">Complete</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
