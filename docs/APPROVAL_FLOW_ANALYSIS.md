╔════════════════════════════════════════════════════════════════════════════╗
║           PERMISSION REQUEST FLOW: GAPS & TIMING ISSUES FOUND              ║
╚════════════════════════════════════════════════════════════════════════════╝

CRITICAL GAPS IDENTIFIED:
──────────────────────

GAP #1: QUEUED APPROVALS ARE INVISIBLE TO PORTAL UI
────────────────────────────────────────────────────
Location:      session.ts:338-344 (getPendingApprovalEvents)
Root Cause:    Only returns the ACTIVE approval, not ALL pending ones
Impact:        Multiple approvals can queue but only first is visible
Severity:      CRITICAL

Function (line 338-344):
  getPendingApprovalEvents(): PortalEvent[] {
    if (!this.activeApprovalId) return [];
    const p = this.pendingApprovals.get(this.activeApprovalId);
    return p ? [p.event] : [];  // ← ONLY returns ONE approval!
  }

Compare with inputs (which work correctly):
  getPendingInputEvents(): PortalEvent[] {
    return Array.from(this.pendingInputs.values()).map(p => p.event);
    // ^ Returns ALL pending inputs!
  }

Timeline of the bug:
  1. SDK fires permission request → handlePermissionRequest() creates event
  2. broadcastNextApproval() sets activeApprovalId and broadcasts it
  3. Another SDK fires second request → stored in pendingApprovals map
  4. activeApprovalId STILL points to first approval
  5. Second approval is QUEUED (not displayed anywhere)
  6. NEW CLIENT CONNECTS:
     - getHistory() completes
     - getPendingApprovalEvents() called → returns [firstApproval] only
     - Client never learns about secondApproval sitting in queue
  7. User resolves first approval
     - broadcastNextApproval() promotes second to active
     - But only ACTIVELY LISTENING clients get the broadcast
     - Clients who were in history load already missed it

Result: Approvals silently queue in pendingApprovals map, never shown to portal UI


GAP #2: TIMEOUT AUTO-DENIAL IS SILENT (No Event Broadcast)
────────────────────────────────────────────────────────
Location:      session.ts:420-428 (handlePermissionRequest)
Root Cause:    Timeout handler deletes approval but doesn't send 'approval_resolved'
Impact:        Approval disappears silently after 5 minutes, next client sees nothing
Severity:      HIGH

Code (line 420-428):
  const timeout = setTimeout(() => {
    if (this.pendingApprovals.has(requestId)) {
      this.pendingApprovals.delete(requestId);           // ← Removed
      if (this.activeApprovalId === requestId) 
        this.activeApprovalId = null;
      resolve({ kind: 'denied-interactively-by-user', feedback: 'Timed out' });
      this.pendingCompletionCount++;
      this.broadcastNextApproval();
      // ⚠️ NO BROADCAST EVENT SENT!
    }
  }, 5 * 60 * 1000);

Compare with resolveApproval() which DOES broadcast (line 375):
  p.resolve(approved ? { kind: 'approved' } : { kind: 'denied-interactively-by-user' });
  this.log(...);
  this.pendingCompletionCount++;
  this.broadcast({ type: 'approval_resolved', requestId });  // ← HAS IT!

Scenario:
  - Client sees approval request
  - Network fails, client gets no other event updates
  - 5 minutes pass
  - Timeout fires, approval deleted, SDK unblocked
  - Client reconnects
  - getPendingApprovalEvents() returns [] (approval gone)
  - Client never knows it was resolved
  - SDK promise was fulfilled but no one knows why


GAP #3: LISTENER DISCONNECT AUTO-DENIAL IS SILENT
──────────────────────────────────────────────────
Location:      session.ts:116-124 + 350-364 (removeListener + denyAllPending)
Root Cause:    When last client disconnects, all approvals auto-denied but no broadcast
Impact:        If new client connects, approvals look resolved but were actually auto-denied
Severity:      HIGH

Code flow:
  removeListener() line 116-124:
    if (this.listeners.size === 0) {
      this.stopPoll();
      if (!this.isTurnActive) this.denyAllPending();
    }
  
  denyAllPending() line 350-364:
    for (const [id, p] of this.pendingApprovals) {
      this.log([Session] Auto-denying approval );
      clearTimeout(p.timeout);
      this.pendingApprovals.delete(id);           // ← Removed from map
      p.resolve({ kind: 'denied-interactively-by-user' });
      // ⚠️ NO BROADCAST EVENT SENT!
    }

Compare with resolveApproval line 375:
  this.broadcast({ type: 'approval_resolved', requestId });  // ← Missing here!

Scenario:
  - Only client is viewing an approval
  - User closes tab (or network fails)
  - denyAllPending() called, approval deleted from map
  - SDK gets deny response, unblocks
  - New client connects 1 second later
  - getPendingApprovalEvents() returns [] (approval already deleted)
  - New client assumes approval was resolved by original client
  - But it was actually auto-denied because no one was watching


GAP #4: APPROVAL AUTO-RESOLVED BEFORE CLIENT SEES IT
─────────────────────────────────────────────────────
Location:      session.ts:435-451 (addRule creates auto-approval race)
Root Cause:    Rule creation can auto-approve queued items while client loading history
Impact:        Client's getPendingApprovalEvents() finds empty queue (already approved)
Severity:      MEDIUM (Benign outcome - user doesn't have to approve)

Code (line 435-451):
  addRule(kind: string, pattern: string) {
    // ... persist rule ...
    // Auto-resolve any queued approvals that now match the new rule
    for (const [id, p] of this.pendingApprovals) {
      if (this.rulesStore.matchesRequest(this.sessionId, p.req)) {
        clearTimeout(p.timeout);
        this.pendingApprovals.delete(id);        // ← REMOVED FROM MAP
        p.resolve({ kind: 'approved' });
        this.broadcast({ type: 'approval_resolved', requestId: id });
      }
    }
    this.broadcastNextApproval();
  }

Timeline:
  T0: Approval #1 active, client sees it
  T1: User clicks "Allow Always" on Approval #1
  T2: New client B starts connecting (getHistory begins)
  T3: addRule() fires, matches Approval #2 in queue
  T4: Approval #2 auto-approved, deleted from pendingApprovals map
  T5: broadcastNextApproval() finds no more, does nothing
  T6: Client B reaches getPendingApprovalEvents() in history load
  T7: Map is now empty, returns []
  T8: Client B finishes history_end with no approval
  Result: Approval was auto-approved before client saw it (timing race)


GAP #5: RECONNECT RE-BROADCAST TIMING WINDOW
───────────────────────────────────────────
Location:      session.ts:293-295 (inside reconnectFromCli)
Root Cause:    Re-broadcast happens in async chain, client may finish history_end first
Impact:        New clients may miss approvals from re-broadcast in rare timing scenarios
Severity:      MEDIUM (Race condition, hard to trigger)

Code (line 293-295):
  async reconnectFromCli() {
    // ... await oldSession.disconnect() ...
    // ... const newSession = await this.reconnectFn(sessionId) ...
    // ... this.attachListeners() ...
    // ... await this.session.getMessages() ...
    // ... await this.syncMessages() ...
    
    // Re-broadcast any pending approvals/inputs in case reconnect disrupted the UI state
    for (const p of this.pendingApprovals.values()) this.broadcast(p.event);
    for (const p of this.pendingInputs.values()) this.broadcast(p.event);
  }

Problem:
  - reconnectFromCli() is async
  - New client can connect DURING the awaits
  - New client's getHistory() may reach history_end BEFORE reconnectFromCli finishes
  - New client's getPendingApprovalEvents() called before re-broadcast happens
  - Timing-dependent outcome

Race scenario:
  T0: Client A connected, approval in queue
  T1: Session change detected, reconnectFromCli() starts
  T2: reconnectFromCli() is waiting on getMessages()
  T3: Client B connects, starts getHistory()
  T4: B's getHistory() completes quickly (before getMessages finishes)
  T5: B calls getPendingApprovalEvents() → sees empty if in wrong queue state
  T6: B finishes history_end
  T7: reconnectFromCli() finally completes, re-broadcast happens
  T8: B is now listening but didn't get the re-broadcast
  Result: Approval may not reach B


═══════════════════════════════════════════════════════════════════════════════

                    EXACT SEQUENCE OF EVENTS (NORMAL PATH)

═══════════════════════════════════════════════════════════════════════════════

1. SDK FIRES PERMISSION REQUEST
   └─ handlePermissionRequest(req: PermissionRequest) [session.ts:400]
      ├─ requestId = \pproval-\\
      ├─ Check RulesStore.matchesRequest() [line 408]
      │  └─ If match: return { kind: 'approved' } immediately [SDK satisfied, no portal]
      ├─ Create PortalEvent:
      │  {
      │    type: 'approval_request',
      │    requestId: 'approval-1',
      │    approval: { requestId, action: req.kind, summary, details, alwaysPattern }
      │  }
      ├─ Create Promise callbacks [line 419]
      ├─ Set 5-minute timeout [line 420-428]
      ├─ Store in pendingApprovals.set(requestId, { resolve, reject, event, req, timeout })
      └─ Call broadcastNextApproval() [line 431]
         ├─ Check: if (this.activeApprovalId) return; [line 392]
         │  └─ If another approval active: SKIP, approval is queued (not broadcast)
         └─ Else:
            ├─ Set activeApprovalId = requestId [line 394]
            ├─ this.broadcast(p.event) [line 395]
            └─ Event sent to ALL current listeners


2. FIRST CLIENT CONNECTED - RECEIVES LIVE BROADCAST
   └─ Session listener attached, broadcast() calls listener function
      └─ Server sends to client: { type: 'approval_request', approval: {...} }


3. SECOND APPROVAL REQUEST ARRIVES (while client watching)
   └─ handlePermissionRequest() again
      ├─ Create new requestId = 'approval-2'
      ├─ Create PortalEvent
      ├─ Store in pendingApprovals.set('approval-2', {...})
      └─ broadcastNextApproval() [line 431]
         ├─ Check: if (this.activeApprovalId) return; [line 392]
         │  └─ activeApprovalId IS 'approval-1', so RETURN EARLY
         └─ approval-2 is QUEUED in map, NOT broadcast


4. NEW CLIENT CONNECTS
   └─ server.ts connection handler [line 54]
      ├─ Add listener to session handle [line 120]
      ├─ Start async history fetch [line 145]
      │  ├─ getHistory(limit) [session.ts:145]
      │  ├─ ws.send({ type: 'history_start' })
      │  ├─ for (const e of events) ws.send(e)  // historical messages
      │  ├─ ws.send({ type: 'history_end' })
      │  │
      │  ├─ getActiveTurnEvents() [line 155]
      │  │  └─ Returns [ { type: 'thinking', ... }, ... ] if isTurnActive
      │  │  └─ Has NOTHING to do with approvals
      │  │
      │  ├─ getPendingApprovalEvents() [line 156] ⚠️ CRITICAL POINT
      │  │  └─ session.ts:338-344
      │  │  └─ if (!this.activeApprovalId) return [];
      │  │  └─ const p = this.pendingApprovals.get('approval-1');
      │  │  └─ return [p.event]; // Only approval-1!
      │  │  └─ approval-2 in queue is INVISIBLE
      │  │
      │  ├─ getPendingInputEvents() [line 157]
      │  │  └─ Returns ALL input requests (correct, matches inputs behavior)
      │  │
      │  ├─ ws.send({ type: 'rules_list', rules: [...] })
      │  │
      │  └─ Completes async


5. CLIENT RECEIVES APPROVALS
   └─ ws.onmessage [App.tsx:644]
      ├─ Parse { type: 'approval_request', approval: {...} }
      ├─ Check line 976: if (event.type === 'approval_request' && event.approval)
      └─ setPendingApproval(event.approval)  // Only 1 item, React state


6. CLIENT RENDERS UI
   └─ App.tsx:1709-1732
      ├─ {pendingApproval && (
      │    <div>⚠️ Permission Request - {pendingApproval.action}</div>
      │    <pre>{pendingApproval.summary}</pre>
      │    <button>Allow</button>
      │    <button>Deny</button>
      │  )}
      └─ User sees ONLY approval-1, never sees approval-2


7. USER RESPONDS TO FIRST APPROVAL
   └─ App.tsx:1157-1161 respondApproval(true)
      ├─ ws.send({ type: 'approval_response', requestId: 'approval-1', approved: true })
      └─ setPendingApproval(null)  // Immediately hide card


8. SERVER PROCESSES RESPONSE
   └─ server.ts:207-208
      └─ handle.resolveApproval('approval-1', true)
         ├─ Get approval from map: const p = this.pendingApprovals.get('approval-1')
         ├─ clearTimeout(p.timeout)
         ├─ this.pendingApprovals.delete('approval-1')  // REMOVE FROM MAP
         ├─ if (this.activeApprovalId === 'approval-1') this.activeApprovalId = null
         ├─ p.resolve({ kind: 'approved' })  // Unblock SDK
         ├─ this.pendingCompletionCount++
         ├─ this.broadcast({ type: 'approval_resolved', requestId: 'approval-1' }) ✓
         └─ this.broadcastNextApproval() [line 376]
            ├─ Check: if (this.activeApprovalId) return; [line 392]
            │  └─ activeApprovalId is now null (was cleared)
            ├─ Loop: for (const [id, p] of this.pendingApprovals) [line 393]
            │  └─ Found: id='approval-2'
            ├─ Set activeApprovalId = 'approval-2'
            ├─ this.broadcast(p.event) for approval-2
            └─ break


9. LIVE LISTENERS RECEIVE NEXT APPROVAL
   └─ Any listeners currently watching get broadcast of approval-2
      └─ Server sends: { type: 'approval_request', approval: {...approval-2...} }


10. CLIENTS REACT TO APPROVAL_RESOLVED EVENT
    └─ App.tsx:978-981
       ├─ if (event.type === 'approval_resolved')
       ├─ setPendingApproval(prev => prev?.requestId === 'approval-1' ? null : prev)
       └─ UI card clears


11. LIVE LISTENER GETS SECOND APPROVAL BROADCAST
    └─ ws.onmessage receives approval-2
       └─ setPendingApproval(approval-2) // New card appears


12. USER RESPONDS TO SECOND APPROVAL
    └─ Repeat from step 7


═══════════════════════════════════════════════════════════════════════════════

                           COMPLETE ANALYSIS TABLE

═══════════════════════════════════════════════════════════════════════════════

| Phase | Location | Operation | State Before | State After | Visible? |
|-------|----------|-----------|--------------|-------------|----------|
| Request | session.ts:400 | Create event, store in map | Empty | pendingApprovals[req-1] | - |
| Broadcast | session.ts:431 | broadcastNextApproval() | activeId=null | activeId='req-1' | YES |
| Request 2 | session.ts:400 | Create event, store | activeId='req-1' | pendingApprovals[req-1,req-2] | - |
| Broadcast 2 | session.ts:431 | broadcastNextApproval() | activeId='req-1' | activeId='req-1' | NO ⚠️ |
| History | server.ts:156 | getPendingApprovalEvents() | Map has [1,2] | Returns only [1] | req-2 INVISIBLE |
| Resolve 1 | session.ts:376 | broadcastNextApproval() | activeId='req-1' | activeId='req-2' | YES (if listening) |
| New Client | server.ts:156 | getPendingApprovalEvents() | activeId='req-2' | Returns [req-2] | If lucky |
| Timeout | session.ts:428 | Auto-deny fires | activeId set | Map cleared | SILENT ⚠️ |
| Disconnect | session.ts:324 | denyAllPending() | Approvals pending | All deleted | SILENT ⚠️ |

═══════════════════════════════════════════════════════════════════════════════

QUICK FIX CHECKLIST:

[ ] FIX #1: Make getPendingApprovalEvents() return ALL approvals
    File: session.ts, Lines: 338-344
    Change: Return Array.from(this.pendingApprovals.values()).map(p => p.event)
    Impact: Client receives all queued approvals
    Trade-off: UI needs to handle multiple cards

[ ] FIX #2: Add broadcast on timeout
    File: session.ts, Line: 428
    Add: this.broadcast({ type: 'approval_resolved', requestId });
    Impact: No silent timeouts

[ ] FIX #3: Add broadcast on auto-denial
    File: session.ts, Line: 363
    Add: this.broadcast({ type: 'approval_resolved', requestId: id });
    Impact: No silent denials on disconnect

[ ] FIX #4: Change event types to distinguish causes
    New: 'approval_timeout', 'approval_auto_denied' instead of generic 'approval_resolved'
    Impact: UI can show different messages

[ ] FIX #5: Ensure synchronous ordering of history + re-broadcast
    File: session.ts (reconnectFromCli) or server.ts
    Option: Re-broadcast before clients allowed to finish history_end

