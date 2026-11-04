# M1 revision 3: adapter pin closure only

R2 remains immutable. Its controller retained the R1 adapter pin despite README claiming repin; this was a real prepare/execute/finalize blocker found by independent review. R3 corrects only that literal and adds an actual-file SHA linkage regression. Adapter/image contract bytes are unchanged from R2. Twelve M1 mock tests passed, including the new linkage assertion. Full patch reconstructs all three exact files. R1/R2 image evidence and limitations otherwise apply. No native execution, preload, dispatch or adoption; fullConsumer NOT_WIRED.
